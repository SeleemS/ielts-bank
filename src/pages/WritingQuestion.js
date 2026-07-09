import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import {
  Box,
  Button,
  Textarea,
  Flex,
  Container,
  Text,
  useToast,
  VStack,
  Heading,
  Progress,
} from '@chakra-ui/react';
import Navbar from '../components/Navbar';
import confetti from 'canvas-confetti';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Spinner,
} from '@chakra-ui/react';

const SITE_URL = 'https://ielts-bank.com';

const WritingQuestion = ({ id: docId, passage, description }) => {
  const passageText = passage?.passageText || '';
  const passageTitle = passage?.passageTitle || '';
  const [userResponse, setUserResponse] = useState('');
  const [apiResponse, setApiResponse] = useState('');
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isInfoOpen, onOpen: onInfoOpen, onClose: onInfoClose } = useDisclosure();
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    onInfoOpen();
  }, []);

  const handleResponseChange = (event) => {
    setUserResponse(event.target.value);
  };

  const countWords = (text) => {
    return text.split(/\s+/).filter(Boolean).length;
  };

  const wordCount = countWords(userResponse);
  const progressValue = Math.min((wordCount / 250) * 100, 100);
  const isWordCountSufficient = wordCount >= 250;

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', 'submit_writing', {
        category: 'User Engagement',
        label: 'Writing Test Submission',
      });
    }

    if (!isWordCountSufficient) {
      toast({
        title: 'Word Count Too Low',
        description: `Your answer must be at least 250 words long. Your current word count is: ${wordCount}`,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        'https://wamm2ytjk5.execute-api.us-east-1.amazonaws.com/IELTSWritingBot',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: passageText, answer: userResponse }),
        }
      );

      if (response.ok) {
        const responseData = await response.json();
        setApiResponse(responseData.message);
        confetti({
          spread: 100,
          particleCount: 200,
          origin: { y: 0.5 },
          zIndex: 1000,
          scalar: 1.4,
        });
        onOpen();
      } else {
        toast({
          title: 'Error',
          description: 'Failed to score the answer. Please try again.',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An error occurred. Please try again.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const pageTitle = passageTitle
    ? `${passageTitle} | IELTS Writing Practice | IELTS-Bank`
    : 'IELTS Writing Practice | IELTS-Bank';
  const metaDescription =
    description ||
    `AI-Powered IELTS grading for your writing. Practice with a real IELTS question like: '${passageTitle}'.`;
  const canonicalUrl = `${SITE_URL}/writingquestion/${encodeURIComponent(docId || '')}`;

  if (!passage) {
    return (
      <Flex direction="column" minH="100vh" bg="gray.50">
        <Navbar />
        <Container maxW="container.md" py={20} textAlign="center">
          <Heading size="md" color="gray.700">Loading question...</Heading>
        </Container>
      </Flex>
    );
  }

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={`${SITE_URL}/logo512.png`} />
        <meta name="twitter:card" content="summary" />
      </Head>

      <Flex direction="column" minH="100vh" bg="gray.50">
        <Navbar />
        <Box flex="1" py={6}>
          <Container maxW="container.xl" pb={16}>
            <VStack align="start" spacing={1} mb={6}>
              <Heading size="lg">{passageTitle}</Heading>
              <Text color="gray.600">IELTS Writing Practice - AI-Powered Feedback</Text>
            </VStack>

            <Flex direction={{ base: 'column', md: 'row' }} gap={6}>
              <Box flex={1} bg="white" p={6} borderRadius="xl" shadow="sm" border="1px solid #E2E8F0">
                <Text fontWeight="bold" mb={3}>Writing Prompt</Text>
                <Box
                  dangerouslySetInnerHTML={{ __html: passageText }}
                  color="gray.700"
                  fontSize="md"
                  lineHeight="1.6"
                />
              </Box>

              <Box
                flex={1}
                bg="white"
                p={6}
                borderRadius="xl"
                shadow="sm"
                border="1px solid #E2E8F0"
                display="flex"
                flexDirection="column"
              >
                <Flex justify="space-between" mb={2}>
                  <Text fontWeight="bold">Your Answer</Text>
                  <VStack spacing={0} align="end">
                    <Text fontSize="sm" color={isWordCountSufficient ? 'green.600' : 'orange.600'}>
                      {wordCount} / 250 words
                    </Text>
                    <Progress
                      value={progressValue}
                      colorScheme={isWordCountSufficient ? 'green' : 'orange'}
                      size="sm"
                      w="100px"
                      borderRadius="full"
                    />
                  </VStack>
                </Flex>
                <Textarea
                  value={userResponse}
                  onChange={handleResponseChange}
                  placeholder="Write your full Task 2 response here..."
                  resize="none"
                  minH="300px"
                  border="1px solid #CBD5E0"
                  _focus={{ borderColor: 'blue.500', boxShadow: 'none' }}
                />
              </Box>
            </Flex>

            <Flex justify="center" mt={10}>
              <Button
                onClick={handleSubmit}
                isDisabled={!isWordCountSufficient}
                size="lg"
                bg="blue.600"
                color="white"
                px={12}
                py={6}
                borderRadius="xl"
                fontWeight="600"
                fontSize="lg"
                _hover={{ bg: 'blue.700', transform: 'translateY(-2px)', shadow: 'xl' }}
                _active={{ transform: 'translateY(0)' }}
                transition="all 0.2s"
              >
                Get AI Feedback
              </Button>
            </Flex>

            {/* AI Feedback Modal (scrollable, smaller height) */}
            <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
              <ModalOverlay />
              <ModalContent maxH="80vh" overflowY="auto">
                <ModalHeader>Your AI Feedback & Score</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                  <Box
                    dangerouslySetInnerHTML={{ __html: apiResponse }}
                    sx={{ '& p': { mb: 3 }, '& strong': { color: 'gray.900' } }}
                  />
                </ModalBody>
                <ModalFooter>
                  <Button onClick={onClose} colorScheme="blue">Close</Button>
                </ModalFooter>
              </ModalContent>
            </Modal>

            {/* Info Modal */}
            <Modal isOpen={isInfoOpen} onClose={onInfoClose} isCentered>
              <ModalOverlay />
              <ModalContent>
                <ModalHeader>How This Works</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                  <Text>
                    We use AI to score your essay using the official IELTS rubric. Your response must
                    be at least 250 words to receive feedback.
                  </Text>
                </ModalBody>
                <ModalFooter>
                  <Button onClick={onInfoClose} colorScheme="blue">Got it</Button>
                </ModalFooter>
              </ModalContent>
            </Modal>

            {/* Loading Modal */}
            <Modal isOpen={isLoading} isCentered closeOnOverlayClick={false}>
              <ModalOverlay />
              <ModalContent>
                <ModalBody textAlign="center" py={10}>
                  <VStack spacing={4}>
                    <Spinner size="xl" thickness="4px" speed="0.6s" />
                    <Text fontWeight="medium" fontSize="md">
                      Analyzing your response... <br />
                      This can take up to 60 seconds.
                    </Text>
                  </VStack>
                </ModalBody>
              </ModalContent>
            </Modal>
          </Container>
        </Box>
      </Flex>
    </>
  );
};

export default WritingQuestion;

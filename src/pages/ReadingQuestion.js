import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import {
    Box,
    Button,
    Flex,
    Container,
    VStack,
    Text,
    Divider,
    Select,
    Input,
    Badge,
    HStack,
    Heading
} from '@chakra-ui/react';
import Navbar from '../components/Navbar';
import ShareButton from '../components/ShareButton';

import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalFooter,
    ModalBody,
    ModalCloseButton,
    useDisclosure,
} from '@chakra-ui/react';

const SITE_URL = 'https://ielts-bank.com';

const ReadingQuestion = ({ id, passage, description }) => {
    const passageText = passage?.passageText || '';
    const passageTitle = passage?.passageTitle || '';
    const questionGroups = passage?.questionGroups || [];

    const [userAnswers, setUserAnswers] = useState({});
    const [answerStatuses, setAnswerStatuses] = useState({});

    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

    const { isOpen, onOpen, onClose } = useDisclosure();
    const [userScore, setUserScore] = useState(null);

    const [remainingTime, setRemainingTime] = useState(1200); // 20 minutes in seconds

    useEffect(() => {
        if (remainingTime > 0) {
            const timerId = setTimeout(() => setRemainingTime(remainingTime - 1), 1000);
            return () => clearTimeout(timerId);
        }
    }, [remainingTime]);

    const formatTime = () => {
        const minutes = Math.floor(remainingTime / 60);
        const seconds = remainingTime % 60;
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    // Derived flat list: assign a continuous global question number (1..N) across
    // all groups. Pure/deterministic so it is safe under React 18 StrictMode.
    const numberedQuestionGroups = useMemo(() => {
        let counter = 0;
        return questionGroups.map(group => ({
            ...group,
            questions: (group.questions || []).map(qMap => {
                counter += 1;
                return { ...qMap, questionNumber: counter };
            })
        }));
    }, [questionGroups]);

    const renderQuestion = (qMap, group) => {
        const questionNumber = qMap.questionNumber;

        const answerStatus = answerStatuses[questionNumber];
        const isCorrect = answerStatus === 'correct';
        const isIncorrect = answerStatus === 'incorrect';
        const bgColor = isCorrect ? 'green.50' : (isIncorrect ? 'red.50' : 'white');
        const borderColor = isCorrect ? 'green.200' : (isIncorrect ? 'red.200' : 'gray.200');

        let answerDisplay = null;

        if (isIncorrect) {
            answerDisplay = (
                <Text color="red.600" mt={3} fontWeight="600" fontSize="sm">
                    Correct Answer: {qMap.answer}
                </Text>
            );
        }

        switch (group.questionType) {
            case "Match":
            case "True or False":
            case "Yes or No":
                return (
                    <Box key={questionNumber} mb={6}>
                        <Text mb={3} fontWeight="600" color="gray.800" fontSize="md">
                            <Text as="span" color="blue.600">{questionNumber}.</Text> {qMap.text}
                        </Text>
                        <Select
                            onChange={e => handleAnswerChange(e, questionNumber)}
                            bg={bgColor}
                            borderColor={borderColor}
                            value={userAnswers[questionNumber] || ''}
                            isReadOnly={isCorrect || isIncorrect}
                            size="lg"
                            borderRadius="lg"
                            _hover={{ borderColor: 'blue.300' }}
                            _focus={{ borderColor: 'blue.500', boxShadow: '0 0 0 1px #3182ce' }}
                        >
                            <option value="" disabled>Select an answer</option>
                            {group.questionType === "Match" && group.options.map((option, idx) => (
                                <option key={idx} value={option}>{option}</option>
                            ))}
                            {group.questionType === "True or False" && (
                                <>
                                    <option value="true">True</option>
                                    <option value="false">False</option>
                                    <option value="not given">Not Given</option>
                                </>
                            )}
                            {group.questionType === "Yes or No" && (
                                <>
                                    <option value="yes">Yes</option>
                                    <option value="no">No</option>
                                    <option value="not given">Not Given</option>
                                </>
                            )}
                        </Select>
                        {answerDisplay}
                    </Box>
                );
            case "Short Answer":
                return (
                    <Box key={questionNumber} mb={6}>
                        <Text mb={3} fontWeight="600" color="gray.800" fontSize="md">
                            <Text as="span" color="blue.600">{questionNumber}.</Text> {qMap.text}
                        </Text>
                        <Input
                            type="text"
                            onChange={e => handleAnswerChange(e, questionNumber)}
                            bg={bgColor}
                            borderColor={borderColor}
                            value={userAnswers[questionNumber] || ''}
                            isReadOnly={isCorrect || isIncorrect}
                            size="lg"
                            borderRadius="lg"
                            placeholder="Type your answer here..."
                            _hover={{ borderColor: 'blue.300' }}
                            _focus={{ borderColor: 'blue.500', boxShadow: '0 0 0 1px #3182ce' }}
                        />
                        {answerDisplay}
                    </Box>
                );
            default:
                return null;
        }
    };

    const renderQuestionGroup = (group) => {
        return (
            <Box key={group.prompt} mb={8}>
                <Text fontSize="lg" fontWeight="700" mb={4} color="gray.900">
                    {group.prompt}
                </Text>
                {group.questions.map(qMap => renderQuestion(qMap, group))}
            </Box>
        );
    };

    const handleAnswerChange = (event, questionNumber) => {
        setUserAnswers(prevAnswers => ({
            ...prevAnswers,
            [questionNumber]: event.target.value.trim().toLowerCase()
        }));
    };

    const handleSubmit = (event) => {
        event.preventDefault();

        if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
            window.gtag('event', 'submit_answer', {
                category: 'User Engagement',
                label: 'Reading Test Submission',
            });
        }

        let newAnswerStatuses = {};
        let correctAnswersCount = 0;
        let totalQuestions = 0;

        // Grade against the in-memory numbered questions using the same continuous
        // global question number that storage, display and coloring use.
        numberedQuestionGroups.forEach(group => {
            group.questions.forEach(qMap => {
                totalQuestions++;
                const correctAnswer = qMap.answer.toLowerCase();
                const userAnswer = userAnswers[qMap.questionNumber] || "-";

                if (userAnswer === correctAnswer) {
                    correctAnswersCount++;
                    newAnswerStatuses[qMap.questionNumber] = 'correct';
                } else {
                    newAnswerStatuses[qMap.questionNumber] = 'incorrect';
                }
            });
        });

        setAnswerStatuses(newAnswerStatuses);
        setUserScore(`You answered ${correctAnswersCount} out of ${totalQuestions} questions correctly!`);
        onOpen();
    };

    const pageTitle = passageTitle
        ? `${passageTitle} | IELTS Reading Practice | IELTS-Bank`
        : 'IELTS Reading Practice | IELTS-Bank';
    const metaDescription =
        description || `Read and answer IELTS Reading questions for the passage: ${passageTitle}.`;
    const canonicalUrl = `${SITE_URL}/readingquestion/${encodeURIComponent(id || '')}`;

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
                <meta name="keywords" content="IELTS, IELTS Reading, IELTS Academic Reading, IELTS General Reading, IELTS Reading Questions, IELTS Reading Practise Questions, IELTS Practice, IELTS Test Prep, IELTS Past Papers, IELTS Questions" />
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
                    <Container maxW="container.xl">
                        {/* Header */}
                        <Flex justify="space-between" align="center" mb={6}>
                            <VStack align="start" spacing={1}>
                                <Heading size="lg" color="gray.900" fontWeight="700">
                                    {passageTitle}
                                </Heading>
                                <Text color="gray.600" fontSize="md">
                                    IELTS Reading Practice
                                </Text>
                            </VStack>
                            <Badge 
                                colorScheme="orange" 
                                variant="subtle" 
                                px={4} 
                                py={2} 
                                borderRadius="full"
                                fontSize="lg"
                                fontWeight="700"
                            >
                                {formatTime()}
                            </Badge>
                        </Flex>

                        {/* Main Content */}
                        <Flex 
                            direction={{ base: "column", lg: "row" }} 
                            gap={6}
                            align="stretch"
                        >
                            {/* Passage Section */}
                            <Box 
                                flex="1"
                                bg="white"
                                borderRadius="xl"
                                border="1px"
                                borderColor="gray.200"
                                shadow="sm"
                                overflow="hidden"
                            >
                                <Box 
                                    p={6}
                                    borderBottom="1px"
                                    borderColor="gray.100"
                                    bg="gray.50"
                                >
                                    <Text fontSize="lg" fontWeight="700" color="gray.900">
                                        Reading Passage
                                    </Text>
                                </Box>
                                <Box 
                                    p={6}
                                    overflowY="auto" 
                                    maxH={{ base: "400px", lg: "600px" }}
                                    fontSize="md"
                                    lineHeight="1.7"
                                    color="gray.800"
                                >
                                    <Box dangerouslySetInnerHTML={{ __html: passageText }} />
                                </Box>
                            </Box>

                            {/* Questions Section */}
                            <Box 
                                flex="1"
                                bg="white"
                                borderRadius="xl"
                                border="1px"
                                borderColor="gray.200"
                                shadow="sm"
                                overflow="hidden"
                            >
                                <Box 
                                    p={6}
                                    borderBottom="1px"
                                    borderColor="gray.100"
                                    bg="gray.50"
                                >
                                    <Text fontSize="lg" fontWeight="700" color="gray.900">
                                        Questions
                                    </Text>
                                </Box>
                                <Box 
                                    p={6}
                                    overflowY="auto"
                                    maxH={{ base: "400px", lg: "600px" }}
                                >
                                    {numberedQuestionGroups.map((group) => (
                                        renderQuestionGroup(group)
                                    ))}
                                </Box>
                            </Box>
                        </Flex>

                        {/* Action Buttons */}
                        <Flex justify="center" gap={4} mt={8}>
                            <Button 
                                size="lg"
                                bg="blue.600"
                                color="white"
                                px={8}
                                py={6}
                                borderRadius="xl"
                                fontWeight="600"
                                _hover={{ 
                                    bg: 'blue.700',
                                    transform: 'translateY(-1px)',
                                    shadow: 'lg'
                                }}
                                _active={{ transform: 'translateY(0)' }}
                                transition="all 0.2s"
                                onClick={handleSubmit}
                            >
                                Submit Answers
                            </Button>
                            <ShareButton
                                title={passageTitle}
                                url={currentUrl}
                                text={`Check out this IELTS Reading Test: ${passageTitle}`}
                            />
                        </Flex>

                        {/* Results Modal */}
                        <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
                            <ModalOverlay bg="blackAlpha.600" />
                            <ModalContent mx={4} borderRadius="xl" overflow="hidden">
                                <ModalHeader bg="blue.50" color="blue.900" fontWeight="700">
                                    Your Results
                                </ModalHeader>
                                <ModalCloseButton />
                                <ModalBody py={6}>
                                    <Text fontSize="lg" color="gray.800" textAlign="center">
                                        {userScore}
                                    </Text>
                                </ModalBody>
                                <ModalFooter bg="gray.50" justifyContent="center">
                                    <Button 
                                        bg="blue.600" 
                                        color="white"
                                        borderRadius="lg"
                                        px={6}
                                        _hover={{ bg: 'blue.700' }}
                                        onClick={onClose}
                                    >
                                        Close
                                    </Button>
                                </ModalFooter>
                            </ModalContent>
                        </Modal>
                    </Container>
                </Box>
            </Flex>
        </>
    );
};

export default ReadingQuestion;
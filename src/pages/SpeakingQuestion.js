import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import {
  Box,
  Flex,
  Container,
  Heading,
  Text,
  VStack,
  HStack,
  Button,
} from '@chakra-ui/react';
import Navbar from '../components/Navbar';

const SpeakingQuestion = () => {
  return (
    <>
      <Head>
        <title>IELTS Speaking Practice (Coming Soon) | IELTS-Bank</title>
        <meta
          name="description"
          content="IELTS Speaking practice is coming soon to IELTS-Bank. In the meantime, practise Reading, Writing and Listening for free."
        />
        <meta name="robots" content="noindex, follow" />
      </Head>

      <Flex direction="column" minH="100vh" bg="gray.50">
        <Navbar />
        <Box flex="1" py={16}>
          <Container maxW="container.md">
            <VStack spacing={6} textAlign="center">
              <Heading size="xl" color="gray.900" fontWeight="700">
                Speaking practice is coming soon
              </Heading>
              <Text fontSize="lg" color="gray.600" maxW="600px">
                We are building an IELTS Speaking practice experience with cue
                cards and model answers. It is not quite ready yet — but you can
                keep improving your score with our other free sections in the
                meantime.
              </Text>
              <HStack spacing={4} flexWrap="wrap" justify="center">
                <Button as={NextLink} href="/readingquestion" colorScheme="blue">
                  Reading Practice
                </Button>
                <Button as={NextLink} href="/writingquestion" colorScheme="blue">
                  Writing Practice
                </Button>
                <Button as={NextLink} href="/listeningquestion" colorScheme="blue">
                  Listening Practice
                </Button>
              </HStack>
            </VStack>
          </Container>
        </Box>
      </Flex>
    </>
  );
};

export default SpeakingQuestion;

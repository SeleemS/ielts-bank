import React, { useState, useMemo } from 'react';
import Head from 'next/head';
import { Box, Button, Textarea, Flex, Container, Text, Divider, useToast, Heading } from '@chakra-ui/react';
import Navbar from '../components/Navbar';
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
    Select,
    Input,
} from '@chakra-ui/react';

const SITE_URL = 'https://ielts-bank.com';

const ListeningQuestion = ({ id, passage, description }) => {
    const audioUrl = passage?.audioUrl || '';
    const passageTitle = passage?.passageTitle || '';
    const questionGroups = passage?.questionGroups || [];
    const [userAnswers, setUserAnswers] = useState({});
    const [answerStatuses, setAnswerStatuses] = useState({});
    const { isOpen, onOpen, onClose } = useDisclosure();
    const [userScore, setUserScore] = useState(null);

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
        const bgColor = isCorrect ? 'green.500' : (isIncorrect ? 'red.500' : 'gray.200');

        switch (group.questionType) {
            case "Match":
            case "True or False":
            case "Yes or No":
                return (
                    <Box key={questionNumber} className="mb-4" my={4}>
                        <Text><strong>{questionNumber}.</strong> {qMap.text}</Text>
                        <Select
                            className="form-control mb-2"
                            onChange={e => handleAnswerChange(e, questionNumber)}
                            bg={bgColor}
                            value={userAnswers[questionNumber] || ''}
                            isReadOnly={isCorrect || isIncorrect}
                        >
                            <option value="" disabled>-</option>
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
                    </Box>
                );
            case "Short Answer":
                return (
                    <Box key={questionNumber} className="mb-4">
                        <Text><strong>{questionNumber}.</strong> {qMap.text}</Text>
                        <Input
                            type="text"
                            className="form-control mb-2"
                            onChange={e => handleAnswerChange(e, questionNumber)}
                            bg={bgColor}
                            value={userAnswers[questionNumber] || ''}
                            isReadOnly={isCorrect || isIncorrect}
                        />
                    </Box>
                );
            default:
                return null;
        }
    };

    const renderQuestionGroup = (group) => {
        return (
            <Box key={group.prompt} mb={6}>
                <Text fontSize="lg" fontWeight="bold" mb={2}>{group.prompt}</Text>
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
        ? `${passageTitle} | IELTS Listening Practice | IELTS-Bank`
        : 'IELTS Listening Practice | IELTS-Bank';
    const metaDescription =
        description || `Practise IELTS Listening with the audio passage: ${passageTitle}.`;
    const canonicalUrl = `${SITE_URL}/listeningquestion/${encodeURIComponent(id || '')}`;

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
                <meta name="keywords" content="IELTS, IELTS Listening, IELTS Listening Questions, IELTS Listening Past Papers, IELTS Practice, IELTS Test Prep, IELTS Past Papers, IELTS Questions" />
                <meta name="robots" content="index, follow" />
                <link rel="canonical" href={canonicalUrl} />
                <meta property="og:title" content={pageTitle} />
                <meta property="og:description" content={metaDescription} />
                <meta property="og:type" content="article" />
                <meta property="og:url" content={canonicalUrl} />
                <meta property="og:image" content={`${SITE_URL}/logo512.png`} />
                <meta name="twitter:card" content="summary" />
            </Head>
            <Navbar />
            <Container maxW="container.xl">
                <Flex 
                    direction={{ base: "column", md: "row" }} 
                    spacing={8} 
                    align="stretch" 
                    my={5}
                >
                    <Box 
                        flex="1" 
                        p={5} 
                        shadow="md" 
                        borderWidth="1px" 
                        overflowY="auto" 
                        maxH={{ base: "33vh", md: "75vh" }}
                        mt={{ base: -1, md: 0 }}
                        mb={{ base: 3, md: 0 }}
                        mx={{ md: 2 }}
                        display="flex" // Make this a flex container
                        flexDirection="column" // Stack children vertically
                        justifyContent="center" // Center children vertically
                    >
                        <Text fontSize="lg" fontWeight="bold" mb={3} alignSelf="start">{passageTitle}:</Text>
                        <audio src={audioUrl} controls style={{ maxWidth: '400px', width: '100%' }} />
                    </Box>

                    <Box 
                        flex="1" 
                        p={5} 
                        shadow="md" 
                        borderWidth="1px" 
                        overflowY="auto" 
                        maxH={{ base: "50vh", md: "75vh" }}
                        minH= {{base: "50vh", md: "75vh"}}
                        mx={{ md: 1 }}
                    >
                        <Text fontSize="lg" fontWeight="bold">Questions:</Text>
                        <Divider my={4} />
                        {numberedQuestionGroups.map((group) => (
                            renderQuestionGroup(group)
                        ))}
                    </Box>
                </Flex>
                <Flex justifyContent="center" mt={-2}>
                    <Button bg="black" colorScheme="blue" onClick={handleSubmit}>
                        Submit
                    </Button>
                </Flex>
                <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
                    <ModalOverlay />
                    <ModalContent mx={4} my="auto" maxW="sm" w="auto"> {/* Adjust width and margins */}
                        <ModalHeader>Your Score</ModalHeader>
                        <ModalCloseButton />
                        <ModalBody>
                            <Text>{userScore}</Text>
                        </ModalBody>
                        <ModalFooter>
                            <Button bg="black" colorScheme="blue" mr={3} onClick={onClose}>
                                Close
                            </Button>
                        </ModalFooter>
                    </ModalContent>
                </Modal>
            </Container>
        </>
    );
};

export default ListeningQuestion;

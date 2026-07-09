import React, { useState } from 'react';
import Head from 'next/head';
import {
  Box,
  Flex,
  VStack,
  Text,
  Container,
  Heading
} from '@chakra-ui/react';
import Navbar from '../components/Navbar';
import Toggle from '../components/Toggle';
import DataTable from '../components/DataTable';
import Footer from '../components/Footer';

const SITE_URL = 'https://ielts-bank.com';
const PAGE_TITLE =
    'IELTS-Bank — Free IELTS Practice Questions: Reading, Writing, Listening';
const PAGE_DESCRIPTION =
    'IELTS-Bank provides the largest free database of IELTS past papers with AI-powered grading. Practise Reading, Writing and Listening on real test questions and improve your score.';

const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'IELTS-Bank',
    url: SITE_URL,
};

const HomePage = () => {
    const [selectedOption, setSelectedOption] = useState('Reading');

    const handleToggleChange = (option) => {
        setSelectedOption(option);
    };

    return (
        <>
        <Head>
            <title>{PAGE_TITLE}</title>
            <meta name="description" content={PAGE_DESCRIPTION} />
            <meta name="keywords" content="IELTS, IELTS Bank, ielts bank, ielts practice, ielts database, IELTS Reading, IELTS Writing, IELTS Listening, IELTS Practice Questions, IELTS Past Papers, IELTS Test Prep" />
            <meta name="robots" content="index, follow" />
            <link rel="canonical" href={`${SITE_URL}/`} />
            <meta property="og:type" content="website" />
            <meta property="og:title" content={PAGE_TITLE} />
            <meta property="og:description" content={PAGE_DESCRIPTION} />
            <meta property="og:url" content={`${SITE_URL}/`} />
            <meta property="og:site_name" content="IELTS-Bank" />
            <meta property="og:image" content={`${SITE_URL}/logo512.png`} />
            <meta name="twitter:card" content="summary" />
            <meta name="twitter:title" content={PAGE_TITLE} />
            <meta name="twitter:description" content={PAGE_DESCRIPTION} />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
            />
        </Head>
        <Flex direction="column" minH="100vh" bg="gray.50">
            <Navbar />
            
            <Box flex="1" py={8}>
                <Container maxW="container.xl">
                    <VStack spacing={8} align="center">
                        {/* Header Section */}
                        <VStack spacing={4} textAlign="center" maxW="600px">
                            <Heading 
                                size="xl" 
                                color="gray.900" 
                                fontWeight="700"
                                lineHeight="1.2"
                            >
                                Master IELTS with Real Practice Questions
                            </Heading>
                            <Text 
                                fontSize="lg" 
                                color="gray.600" 
                                fontWeight="500"
                                lineHeight="1.6"
                            >
                                Access the largest database of authentic IELTS past papers with AI-powered grading and instant feedback.
                            </Text>
                        </VStack>

                        {/* Toggle Section */}
                        <VStack spacing={6} w="full" align="center">
                            <Toggle onChange={handleToggleChange} />
                            
                            {/* Table Section */}
                            <Box w="full" maxW="900px">
                                <DataTable selectedOption={selectedOption} />
                            </Box>
                        </VStack>
                    </VStack>
                </Container>
            </Box>
            
            <Footer />
        </Flex>
        </>
    );
};

export default HomePage;
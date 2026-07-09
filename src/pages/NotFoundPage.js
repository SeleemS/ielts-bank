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

const NotFoundPage = () => {
  return (
    <>
      <Head>
        <title>404 — Page Not Found | IELTS-Bank</title>
        <meta name="robots" content="noindex, follow" />
      </Head>

      <Flex direction="column" minH="100vh" bg="gray.50">
        <Navbar />
        <Box flex="1" py={20}>
          <Container maxW="container.md">
            <VStack spacing={6} textAlign="center">
              <Heading size="2xl" color="blue.600" fontWeight="800">
                404
              </Heading>
              <Heading size="lg" color="gray.900" fontWeight="700">
                Page Not Found
              </Heading>
              <Text fontSize="lg" color="gray.600" maxW="500px">
                Sorry, the page you are looking for does not exist or has been
                moved. Let&apos;s get you back on track.
              </Text>
              <HStack spacing={4} flexWrap="wrap" justify="center">
                <Button as={NextLink} href="/" colorScheme="blue" size="lg">
                  Go to Homepage
                </Button>
                <Button as={NextLink} href="/blog" variant="outline" colorScheme="blue" size="lg">
                  Read the Blog
                </Button>
              </HStack>
            </VStack>
          </Container>
        </Box>
      </Flex>
    </>
  );
};

export default NotFoundPage;

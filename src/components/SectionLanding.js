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
  SimpleGrid,
  Badge,
  LinkBox,
  LinkOverlay,
} from '@chakra-ui/react';
import Navbar from './Navbar';
import Footer from './Footer';

const SITE_URL = 'https://ielts-bank.com';

const difficultyColor = {
  Easy: 'green',
  Medium: 'yellow',
  Hard: 'red',
  'Task 2': 'blue',
};

const SectionLanding = ({
  section, // e.g. 'reading'
  heading,
  intro,
  title,
  description,
  items = [],
}) => {
  const canonical = `${SITE_URL}/${section}question`;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={`${SITE_URL}/logo512.png`} />
        <meta name="twitter:card" content="summary" />
      </Head>

      <Flex direction="column" minH="100vh" bg="gray.50">
        <Navbar />
        <Box flex="1" py={{ base: 8, md: 12 }}>
          <Container maxW="container.lg">
            <VStack align="stretch" spacing={2} mb={8}>
              <Heading as="h1" size="xl" color="gray.900" fontWeight="700">
                {heading}
              </Heading>
              <Text fontSize="lg" color="gray.600">
                {intro}
              </Text>
            </VStack>

            {items.length === 0 ? (
              <Text color="gray.600">No questions are available yet. Please check back soon.</Text>
            ) : (
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5}>
                {items.map((item) => (
                  <LinkBox
                    key={item.id}
                    as="article"
                    bg="white"
                    borderRadius="xl"
                    border="1px"
                    borderColor="gray.200"
                    shadow="sm"
                    p={6}
                    transition="all 0.2s"
                    _hover={{ shadow: 'md', borderColor: 'blue.200', transform: 'translateY(-2px)' }}
                  >
                    <Flex justify="space-between" align="start" gap={3}>
                      <Heading as="h2" size="md" color="gray.900" fontWeight="700">
                        <LinkOverlay as={NextLink} href={`/${section}question/${item.legacyId || item.id}`}>
                          {item.title}
                        </LinkOverlay>
                      </Heading>
                      {item.difficulty && (
                        <Badge
                          colorScheme={difficultyColor[item.difficulty] || 'gray'}
                          variant="subtle"
                          px={3}
                          py={1}
                          borderRadius="full"
                          fontWeight="600"
                          fontSize="xs"
                          flexShrink={0}
                        >
                          {item.difficulty}
                        </Badge>
                      )}
                    </Flex>
                  </LinkBox>
                ))}
              </SimpleGrid>
            )}
          </Container>
        </Box>
        <Footer />
      </Flex>
    </>
  );
};

export default SectionLanding;

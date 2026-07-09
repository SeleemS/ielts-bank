import Head from "next/head";
import NextLink from "next/link";
import {
  Box,
  Container,
  Flex,
  Heading,
  Text,
  VStack,
  Link,
  LinkBox,
  LinkOverlay,
} from "@chakra-ui/react";
import Navbar from "../../src/components/Navbar";
import Footer from "../../src/components/Footer";
import { posts } from "../../lib/posts";

const SITE_URL = "https://ielts-bank.com";
const PAGE_TITLE = "IELTS Blog: Tips, Strategies and Band Score Guides | IELTS-Bank";
const PAGE_DESCRIPTION =
  "Free IELTS preparation articles covering Reading, Writing, Listening and Speaking strategies, band score calculation, and proven tips to raise your score.";

export default function BlogIndex({ posts }) {
  const canonical = `${SITE_URL}/blog`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "IELTS-Bank Blog",
    description: PAGE_DESCRIPTION,
    url: canonical,
    hasPart: posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: `${SITE_URL}/blog/${post.slug}`,
      datePublished: new Date(post.date).toISOString(),
    })),
  };

  return (
    <>
      <Head>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESCRIPTION} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={canonical} />

        <meta property="og:type" content="website" />
        <meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content={PAGE_DESCRIPTION} />
        <meta property="og:url" content={canonical} />
        <meta property="og:site_name" content="IELTS-Bank" />

        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={PAGE_TITLE} />
        <meta name="twitter:description" content={PAGE_DESCRIPTION} />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </Head>

      <Flex direction="column" minH="100vh" bg="gray.50">
        <Navbar />

        <Box flex="1" py={{ base: 8, md: 12 }}>
          <Container maxW="container.md">
            <VStack align="stretch" spacing={2} mb={8}>
              <Heading as="h1" size="xl" color="gray.900" fontWeight="700">
                IELTS-Bank Blog
              </Heading>
              <Text fontSize="lg" color="gray.600">
                Strategies, tips and band score guides to help you prepare for
                every part of the IELTS exam.
              </Text>
            </VStack>

            <VStack align="stretch" spacing={6}>
              {posts.map((post) => (
                <LinkBox
                  key={post.slug}
                  as="article"
                  bg="white"
                  borderRadius="xl"
                  border="1px"
                  borderColor="gray.200"
                  shadow="sm"
                  p={{ base: 5, md: 6 }}
                  transition="all 0.2s"
                  _hover={{ shadow: "md", borderColor: "blue.200" }}
                >
                  <Text color="gray.500" fontSize="sm" mb={2}>
                    {post.date}
                  </Text>
                  <Heading as="h2" size="md" color="gray.900" fontWeight="700" mb={2}>
                    <LinkOverlay as={NextLink} href={`/blog/${post.slug}`}>
                      {post.title}
                    </LinkOverlay>
                  </Heading>
                  <Text color="gray.700" fontSize="md" lineHeight="1.6" mb={3}>
                    {post.excerpt}
                  </Text>
                  <Link
                    as={NextLink}
                    href={`/blog/${post.slug}`}
                    color="blue.600"
                    fontSize="sm"
                    fontWeight="600"
                    _hover={{ textDecoration: "underline" }}
                  >
                    Read more →
                  </Link>
                </LinkBox>
              ))}
            </VStack>
          </Container>
        </Box>

        <Footer />
      </Flex>
    </>
  );
}

export async function getStaticProps() {
  const sorted = [...posts].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  return { props: { posts: sorted } };
}

import Head from "next/head";
import NextLink from "next/link";
import { Box, Container, Flex, Heading, Text, Link } from "@chakra-ui/react";
import Navbar from "../../src/components/Navbar";
import Footer from "../../src/components/Footer";
import { posts } from "../../lib/posts";

const SITE_URL = "https://ielts-bank.com";

export default function BlogPost({ post }) {
  const canonical = `${SITE_URL}/blog/${post.slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    datePublished: new Date(post.date).toISOString(),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonical,
    },
    author: {
      "@type": "Organization",
      name: "IELTS-Bank",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "IELTS-Bank",
      url: SITE_URL,
    },
  };

  return (
    <>
      <Head>
        <title>{`${post.title} | IELTS-Bank`}</title>
        <meta name="description" content={post.excerpt} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={canonical} />

        <meta property="og:type" content="article" />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.excerpt} />
        <meta property="og:url" content={canonical} />
        <meta property="og:site_name" content="IELTS-Bank" />

        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={post.title} />
        <meta name="twitter:description" content={post.excerpt} />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </Head>

      <Flex direction="column" minH="100vh" bg="gray.50">
        <Navbar />

        <Box flex="1" py={{ base: 8, md: 12 }}>
          <Container maxW="container.md">
            <Box
              bg="white"
              borderRadius="xl"
              border="1px"
              borderColor="gray.200"
              shadow="sm"
              p={{ base: 6, md: 10 }}
            >
              <Link
                as={NextLink}
                href="/blog"
                color="blue.600"
                fontSize="sm"
                fontWeight="600"
                _hover={{ textDecoration: "underline" }}
              >
                ← Back to Blog
              </Link>

              <Heading
                as="h1"
                size="xl"
                color="gray.900"
                fontWeight="700"
                lineHeight="1.2"
                mt={4}
                mb={2}
              >
                {post.title}
              </Heading>

              <Text color="gray.500" fontSize="sm" mb={8}>
                {post.date}
              </Text>

              <Box
                color="gray.800"
                fontSize="md"
                lineHeight="1.8"
                sx={{
                  "h2": {
                    fontSize: "xl",
                    fontWeight: "700",
                    color: "gray.900",
                    mt: 8,
                    mb: 3,
                  },
                  "h3": {
                    fontSize: "lg",
                    fontWeight: "600",
                    color: "gray.900",
                    mt: 6,
                    mb: 2,
                  },
                  "p": { mb: 4 },
                  "ul, ol": { pl: 6, mb: 4 },
                  "li": { mb: 2 },
                  "strong": { fontWeight: "700", color: "gray.900" },
                  "a": {
                    color: "blue.600",
                    fontWeight: "500",
                    textDecoration: "underline",
                  },
                  "a:hover": { color: "blue.700" },
                }}
                dangerouslySetInnerHTML={{ __html: post.content }}
              />
            </Box>
          </Container>
        </Box>

        <Footer />
      </Flex>
    </>
  );
}

export async function getStaticPaths() {
  return {
    paths: posts.map((post) => ({ params: { slug: post.slug } })),
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const post = posts.find((p) => p.slug === params.slug) || null;

  if (!post) {
    return { notFound: true };
  }

  return { props: { post } };
}

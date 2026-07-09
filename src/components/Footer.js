import React from 'react';
import { Box, Container, Text, Flex, Link, Spacer } from '@chakra-ui/react';
import NextLink from 'next/link';

const Footer = () => {
    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    };
    
    return (
        <Box bg="gray.900" color="white" py={8} mt="auto">
            <Container maxW="container.xl">
                <Flex direction={{ base: "column", md: "row" }} alignItems="center" gap={4}>
                    <Text fontSize="sm" color="gray.400" fontWeight="500">
                        © {new Date().getFullYear()} IELTS-Bank. All rights reserved.
                    </Text>
                    <Spacer />
                    <Flex gap={6} direction={{ base: "column", md: "row" }} align="center">
                        <NextLink href="/blog" passHref legacyBehavior>
                            <Link
                                onClick={scrollToTop}
                                color="gray.300"
                                fontSize="sm"
                                fontWeight="500"
                                _hover={{
                                    color: 'white',
                                    textDecoration: 'none'
                                }}
                                transition="color 0.2s"
                            >
                                Blog
                            </Link>
                        </NextLink>
                        <NextLink href="/termsofservice" passHref legacyBehavior>
                            <Link 
                                onClick={scrollToTop} 
                                color="gray.300"
                                fontSize="sm"
                                fontWeight="500"
                                _hover={{ 
                                    color: 'white',
                                    textDecoration: 'none'
                                }}
                                transition="color 0.2s"
                            >
                                Terms of Service
                            </Link>
                        </NextLink>
                        <NextLink href="/privacypolicy" passHref legacyBehavior>
                            <Link 
                                onClick={scrollToTop} 
                                color="gray.300"
                                fontSize="sm"
                                fontWeight="500"
                                _hover={{ 
                                    color: 'white',
                                    textDecoration: 'none'
                                }}
                                transition="color 0.2s"
                            >
                                Privacy Policy
                            </Link>
                        </NextLink>
                        <NextLink href="/contactus" passHref legacyBehavior>
                            <Link 
                                onClick={scrollToTop} 
                                color="gray.300"
                                fontSize="sm"
                                fontWeight="500"
                                _hover={{ 
                                    color: 'white',
                                    textDecoration: 'none'
                                }}
                                transition="color 0.2s"
                            >
                                Contact Us
                            </Link>
                        </NextLink>
                    </Flex>
                </Flex>
                <Text fontSize="xs" color="gray.500" mt={6} textAlign={{ base: "center", md: "left" }} maxW="container.md">
                    IELTS-Bank is an independent study resource and is not affiliated with, endorsed by, or connected to the British Council, IDP: IELTS Australia, or Cambridge University Press &amp; Assessment. &quot;IELTS&quot; is a registered trademark of its respective owners and is used here for descriptive purposes only.
                </Text>
            </Container>
        </Box>
    );
};

export default Footer;
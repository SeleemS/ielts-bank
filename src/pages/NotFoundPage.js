import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '../../components/ui/button';

const NotFoundPage = () => {
  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <Head>
        <title>404 — Page Not Found | IELTS-Bank</title>
        <meta name="robots" content="noindex, follow" />
      </Head>

      <Navbar />

      <main className="flex flex-1 items-center justify-center px-4 py-20">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-7xl font-extrabold tracking-tight text-accent sm:text-8xl">
            404
          </p>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Page Not Found
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
            Sorry, the page you are looking for does not exist or has been moved.
            Let&apos;s get you back on track.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" variant="accent">
              <NextLink href="/" className="no-underline">
                Go to Homepage
              </NextLink>
            </Button>
            <Button asChild size="lg" variant="outline">
              <NextLink href="/blog" className="no-underline">
                Read the Blog
              </NextLink>
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default NotFoundPage;

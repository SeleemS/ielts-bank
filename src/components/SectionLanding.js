import React from 'react';
import Head from 'next/head';
import Navbar from './Navbar';
import Footer from './Footer';
import DataTable from './DataTable';

// Pure Tailwind/shadcn section landing. NO Chakra imports.
//
// Shared UI for the three section index pages (Reading / Writing / Listening).
// Renders SEO head, the Tailwind Navbar + Footer, a heading/intro, and the
// DataTable question browser fed the pre-fetched list from getStaticProps.

const SITE_URL = 'https://ielts-bank.com';

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

      <div className="tw-root flex min-h-screen flex-col bg-background font-sans text-foreground">
        <Navbar />

        <main className="flex-1">
          <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
            <header className="mb-8 max-w-2xl">
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {heading}
              </h1>
              <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
                {intro}
              </p>
            </header>

            <DataTable skill={section} items={items} />
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default SectionLanding;

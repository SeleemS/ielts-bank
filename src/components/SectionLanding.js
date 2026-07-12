import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import Navbar from './Navbar';
import Footer from './Footer';
import DataTable from './DataTable';
import { READING_QUESTION_TYPE_LINKS } from '../../lib/readingQuestionTypes';

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
  const skillLabel = section
    ? section.charAt(0).toUpperCase() + section.slice(1)
    : 'Practice';
  const ogTitle = `IELTS ${skillLabel} Practice`;
  const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(
    ogTitle
  )}&type=${encodeURIComponent(section || 'default')}`;

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
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={`${ogTitle} — IELTS-Bank`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={ogImage} />
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

            {/* Reading only: practise by question type. */}
            {section === 'reading' && (
              <section className="mt-12 rounded-2xl border border-border bg-secondary/40 p-6 sm:p-8">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  Practice by question type
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Target a specific IELTS Reading question type with a focused strategy guide and
                  matching practice passages.
                </p>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  {READING_QUESTION_TYPE_LINKS.map(({ slug, label }) => (
                    <NextLink
                      key={slug}
                      href={`/reading/${slug}`}
                      className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground no-underline shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
                    >
                      {label}
                    </NextLink>
                  ))}
                </div>
              </section>
            )}
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default SectionLanding;

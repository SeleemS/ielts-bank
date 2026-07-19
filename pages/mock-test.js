import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { ArrowRight, Clock, FileCheck2 } from 'lucide-react';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { listMockTests } from '../lib/supabase';
import { MOCK_INDEX_SEO } from '../lib/mockSeo';

export default function MockTestIndex({ mocks = [] }) {
  const seo = MOCK_INDEX_SEO;

  return (
    <>
      <Head>
        <title>{seo.title}</title>
        <meta name="description" content={seo.description} />
        <link rel="canonical" href={seo.canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={seo.title} />
        <meta property="og:description" content={seo.description} />
        <meta property="og:url" content={seo.canonical} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={seo.ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={seo.imageAlt} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seo.title} />
        <meta name="twitter:description" content={seo.description} />
        <meta name="twitter:image" content={seo.ogImage} />
      </Head>
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <Badge variant="emerald">Included with Premium</Badge>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              IELTS mock tests
            </h1>
            <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
              Practise a complete test under timed conditions, then review every answer with a
              per-section breakdown and an estimated IELTS band.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {mocks.map((mock) => (
              <Card key={mock.id} className="transition-colors hover:border-accent/40">
                <CardContent className="p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="capitalize">{mock.skill}</Badge>
                    {mock.module ? <Badge variant="outline" className="capitalize">{mock.module}</Badge> : null}
                    <Badge variant="emerald">Premium</Badge>
                  </div>
                  <h2 className="mt-4 text-xl font-bold text-foreground">{mock.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{mock.description}</p>
                  <div className="mt-4 flex flex-wrap gap-4 text-xs font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" />{mock.skill === 'reading' ? '60' : '40'} minutes</span>
                    <span className="inline-flex items-center gap-1"><FileCheck2 className="h-4 w-4" />{mock.sectionCount} sections</span>
                  </div>
                  <NextLink href={`/mock/${mock.slug}`} className="mt-5 inline-flex items-center gap-1 font-semibold text-accent no-underline">
                    Start mock test <ArrowRight className="h-4 w-4" />
                  </NextLink>
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
}

export async function getStaticProps() {
  return { props: { mocks: await listMockTests() }, revalidate: 3600 };
}

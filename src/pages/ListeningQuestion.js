import React from 'react';
import Head from 'next/head';
import Navbar from '../components/Navbar';
import { Badge } from '../../components/ui/badge';
import QuestionEngine from '../components/question/QuestionEngine';

const SITE_URL = 'https://ielts-bank.com';

const ListeningQuestion = ({ id, passage, description }) => {
  if (!passage) {
    return (
      <div className="tw-root min-h-screen bg-background">
        <Navbar />
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h1 className="text-lg font-semibold text-muted-foreground">Loading question…</h1>
        </div>
      </div>
    );
  }

  const { title, audioUrl, groups, difficulty, slug } = passage;
  const pageTitle = title
    ? `${title} | IELTS Listening Practice | IELTS-Bank`
    : 'IELTS Listening Practice | IELTS-Bank';
  const metaDescription =
    description || `Practise IELTS Listening with the audio passage: ${title}.`;
  const canonicalUrl = `${SITE_URL}/listeningquestion/${encodeURIComponent(id || '')}`;

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta
          name="keywords"
          content="IELTS, IELTS Listening, IELTS Listening Questions, IELTS Listening Past Papers, IELTS Practice, IELTS Test Prep"
        />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={`${SITE_URL}/logo512.png`} />
        <meta name="twitter:card" content="summary" />
      </Head>

      <div className="tw-root min-h-screen bg-background">
        <Navbar />

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              IELTS Listening Practice
              {difficulty && (
                <Badge variant="emerald" className="capitalize">
                  {difficulty}
                </Badge>
              )}
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            {/* Audio column (sticky on desktop) */}
            <div className="lg:sticky lg:top-20 lg:self-start">
              <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-foreground">
                  Audio
                </h2>
                {audioUrl ? (
                  <audio src={audioUrl} controls className="w-full">
                    Your browser does not support the audio element.
                  </audio>
                ) : (
                  <p className="text-sm text-muted-foreground">Audio unavailable for this item.</p>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  You can replay the recording as many times as you like while practising.
                </p>
              </div>
            </div>

            {/* Questions column */}
            <div className="rounded-lg border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
                  Questions
                </h2>
              </div>
              <div className="px-5 py-4">
                <QuestionEngine groups={groups} storageKey={slug || id} skill="listening" />
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default ListeningQuestion;

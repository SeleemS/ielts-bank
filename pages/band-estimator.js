import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';
import EstimatorRunner from '../src/components/estimator/EstimatorRunner';
import { getStructuredPassage } from '../lib/supabase';
import {
  READING_SET,
  LISTENING_SET,
  selectGroups,
} from '../lib/estimatorConfig';
import { SITE_URL } from '../lib/site';

const PAGE_TITLE = 'Free IELTS Band Estimator — 15-Minute Level Test | IELTS-Bank';
const PAGE_DESCRIPTION =
  'Find out your IELTS band in about 15 minutes. Answer real Reading and Listening questions, self-check your Writing and Speaking, and get an honest band estimate with a clear next step. Free, no sign-up.';
const CANONICAL = `${SITE_URL}/band-estimator`;
const FAQ = [
  {
    q: 'Is this an official IELTS score?',
    a: 'No. It is an independent study estimate based on 20 real practice questions and your own Writing and Speaking self-assessment. Only an official test can issue an IELTS score.',
  },
  {
    q: 'Why are Writing and Speaking shown as ranges?',
    a: 'Those skills need a written response or live performance to measure properly. A range is more honest than pretending three self-rating questions can produce an exact band.',
  },
  {
    q: 'Does the estimator work for General Training IELTS?',
    a: 'The Reading estimate uses the Academic conversion curve. General Training Reading uses a different raw-score conversion, which you can explore in the Band Calculator.',
  },
  {
    q: 'Do I need an account?',
    a: 'No. The complete estimate is anonymous and free. You can create an account afterward if you want to score a Writing response or track your practice.',
  },
  {
    q: 'How often should I retake it?',
    a: 'Retake it after two to four weeks of focused practice. For a sharper measurement, use a full 40-question mock test under timed conditions.',
  },
];

export default function BandEstimatorPage({
  readingGroups,
  listeningGroups,
  listeningAudioUrl,
  readingTitle,
  listeningTitle,
  readingBodyHtml,
}) {
  return (
    <>
      <Head>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESCRIPTION} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={CANONICAL} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content={PAGE_DESCRIPTION} />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          property="og:image"
          content={`${SITE_URL}/api/og?title=${encodeURIComponent('What is your IELTS band?')}&type=estimator`}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: FAQ.map((item) => ({
                '@type': 'Question',
                name: item.q,
                acceptedAnswer: { '@type': 'Answer', text: item.a },
              })),
            }).replace(/</g, '\\u003c'),
          }}
        />
      </Head>

      <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <Navbar />
        <main className="flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-12 lg:px-8">
            <EstimatorRunner
              readingGroups={readingGroups}
              listeningGroups={listeningGroups}
              listeningAudioUrl={listeningAudioUrl}
              readingTitle={readingTitle}
              listeningTitle={listeningTitle}
              readingBodyHtml={readingBodyHtml}
            />
          </div>

          <section id="estimator-seo-content" className="border-t border-border bg-secondary/20">
            <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
              <h2 className="text-3xl font-bold tracking-tight">How this IELTS band estimate works</h2>
              <div className="mt-6 space-y-5 text-base leading-8 text-muted-foreground">
                <p>
                  This diagnostic samples two skills that can be marked objectively in the browser.
                  You answer ten Academic Reading questions and ten Listening questions drawn from
                  the same structured practice bank used across IELTS-Bank. Your answers are graded
                  against the stored answer keys, then scaled to the familiar nine-band range. With
                  only ten questions per measured skill, the result is deliberately shown as an
                  approximation rather than false precision.
                </p>
                <p>
                  Writing and Speaking cannot be measured responsibly from multiple-choice answers.
                  They depend on task response, coherence, vocabulary, grammar, fluency, and
                  pronunciation. The short self-check therefore returns a one-band range and styles
                  it differently from the measured Reading and Listening cards. Self-ratings often
                  run optimistic, so use those ranges to choose your next task—not as proof of a
                  score.
                </p>
                <p>
                  Band 5 generally reflects a partial command that still breaks down under pressure.
                  Band 6 is competent but inconsistent, while Band 7 shows an operational command
                  with occasional errors. Bands 8 and 9 require increasingly precise, flexible
                  control. Your target depends on the university, regulator, employer, and whether
                  they require a minimum score in each skill as well as an overall band.
                </p>
                <p>
                  The fastest useful next step is to practise the weakest measured skill, then remove
                  the uncertainty from Writing or Speaking. You can submit one Writing response for
                  a free sample AI score, or use Premium to see the full criterion breakdown and meet
                  the live AI examiner. If you already know your raw scores from a complete test, use
                  the <NextLink className="font-semibold text-accent" href="/band-calculator">IELTS Band Calculator</NextLink>{' '}
                  instead. It contains the full Academic and General Training conversion tables that
                  are intentionally not duplicated here.
                </p>
                <p>
                  For a more stable baseline, sit a full mock under real timing, review each error,
                  and repeat with different material. A short diagnostic is best for direction; a
                  longer test is better for confirmation. Save this result locally, practise for two
                  to four weeks, and retake the estimator to see whether the direction has changed.
                </p>
              </div>

              <h2 className="mt-14 text-2xl font-bold tracking-tight">Frequently asked questions</h2>
              <div className="mt-6 space-y-4">
                {FAQ.map((item) => (
                  <article key={item.q} className="rounded-2xl border border-border bg-card p-5">
                    <h3 className="font-bold text-foreground">{item.q}</h3>
                    <p className="mt-2 leading-7 text-muted-foreground">{item.a}</p>
                  </article>
                ))}
              </div>
              <p className="mt-10 text-sm leading-6 text-muted-foreground">
                IELTS-Bank is an independent study resource and is not affiliated with or endorsed
                by the British Council, IDP, or Cambridge University Press &amp; Assessment. IELTS is
                a registered trademark of its respective owners.
              </p>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}

export async function getStaticProps() {
  const [structuredReading, structuredListening] = await Promise.all([
    getStructuredPassage('reading', READING_SET.slug),
    getStructuredPassage('listening', LISTENING_SET.slug),
  ]);

  const readingGroups = selectGroups(structuredReading, READING_SET);
  const listeningGroups = selectGroups(structuredListening, LISTENING_SET);

  // Fail the build loudly if the fixed content can't be resolved — a silent
  // empty set would ship an unusable estimator.
  if (!structuredReading || readingGroups.length === 0) {
    throw new Error(
      `Band estimator: reading passage "${READING_SET.slug}" resolved no groups for indexes ${JSON.stringify(
        READING_SET.groupIndexes
      )}.`
    );
  }
  if (!structuredListening || listeningGroups.length === 0) {
    throw new Error(
      `Band estimator: listening passage "${LISTENING_SET.slug}" resolved no groups for indexes ${JSON.stringify(
        LISTENING_SET.groupIndexes
      )}.`
    );
  }

  return {
    props: {
      readingGroups,
      listeningGroups,
      listeningAudioUrl: structuredListening.audioUrl || '',
      readingTitle: structuredReading.title || READING_SET.title,
      listeningTitle: structuredListening.title || LISTENING_SET.title,
      readingBodyHtml: structuredReading.bodyHtml || '',
    },
    revalidate: 3600,
  };
}

import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { ArrowLeft, ArrowRight, BookOpenCheck, PenLine, TrendingUp } from 'lucide-react';
import Navbar from '../../src/components/Navbar';
import Footer from '../../src/components/Footer';
import AdUnit from '../../src/components/AdUnit';
import ShareRow from '../../src/components/ShareRow';
import { Button } from '../../components/ui/button';
import { cn } from '../../src/lib/utils';
import { track } from '../../src/lib/analytics';
import { saveWritingDraft } from '../../src/lib/writingDraft';
import { SITE_URL } from '../../lib/site';
import { toIsoDate } from '../../lib/postDates';
import { formatBand, questionTypeLabel, taskLabel, topicLabel } from '../../lib/essayTaxonomy';
// Server-only: referenced ONLY inside getStaticPaths/getStaticProps, so Next
// strips it (and `fs`) from the client bundle.
import { essays, getEssayBySlug, relatedEssays } from '../../lib/essays';

// Tailwind Preflight is off, so the rendered essay/comment HTML is styled via
// child selectors, matching the blog's PROSE approach.
const PROSE =
  'text-[15px] leading-8 text-slate-700 [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mb-1 [&_strong]:font-semibold [&_strong]:text-foreground [&_em]:italic';
const ESSAY_PROSE =
  'text-base leading-8 text-foreground [&_p]:mb-5 [&_mark]:rounded [&_mark]:bg-amber-100 [&_mark]:px-1 [&_mark]:py-0.5 [&_mark]:text-foreground [&_mark]:font-medium';

const CHECKER_TASK_TYPE = {
  'task2-academic': 'task2',
  'task2-general': 'task2',
  'task1-academic': 'task1-academic',
  'task1-general': 'task1-general',
};

function bandTone(band) {
  if (band >= 8) return 'bg-emerald-100 text-emerald-900 ring-emerald-200';
  if (band >= 7) return 'bg-sky-100 text-sky-900 ring-sky-200';
  return 'bg-amber-100 text-amber-900 ring-amber-200';
}

export default function EssayPage({ essay, siblings, related }) {
  const band = formatBand(essay.band);
  const canonical = `${SITE_URL}/ielts-essay-bank/${essay.slug}`;
  const practiceHref = `/writingquestion/${essay.practice}`;
  const nextBand = essay.band >= 8.5 ? 9 : Math.floor(essay.band) + 1;
  const kind = essay.task === 1 ? (essay.bucket === 'task1-general' ? 'letter' : 'report') : 'essay';
  const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(
    `${essay.title} — Band ${band}`
  )}&type=writing&subtitle=${encodeURIComponent('IELTS Essay Bank')}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${canonical}#article`,
        headline: essay.seoTitle,
        description: essay.excerpt,
        image: [ogImage],
        datePublished: toIsoDate(essay.date),
        dateModified: toIsoDate(essay.date),
        wordCount: essay.wordCount,
        inLanguage: 'en',
        articleSection: 'IELTS Essay Bank',
        about: [
          { '@type': 'Thing', name: `IELTS Writing ${taskLabel(essay.bucket)}` },
          { '@type': 'Thing', name: questionTypeLabel(essay.type) },
        ],
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
        author: { '@type': 'Organization', name: 'IELTS-Bank', url: SITE_URL },
        publisher: {
          '@type': 'Organization',
          name: 'IELTS-Bank',
          url: SITE_URL,
          logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo512.png` },
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'IELTS Essay Bank', item: `${SITE_URL}/ielts-essay-bank` },
          { '@type': 'ListItem', position: 3, name: `${essay.title} — Band ${band}`, item: canonical },
        ],
      },
    ],
  };

  const onPracticeClick = (placement) =>
    track('product_cta_click', {
      source: 'essay_bank',
      placement,
      product: 'writing_practice',
      essay: essay.slug,
    });

  // Secondary CTA: hand the prompt to the Writing Checker, which pre-fills the
  // task type + question on mount (a one-shot sessionStorage handoff, see
  // src/lib/writingDraft.js); the learner writes the answer there. Without
  // JavaScript the link still opens the checker, just without the prompt.
  const onCheckerClick = () => {
    track('product_cta_click', {
      source: 'essay_bank',
      placement: 'checker',
      product: 'writing_checker',
      essay: essay.slug,
    });
    saveWritingDraft({
      taskType: CHECKER_TASK_TYPE[essay.bucket],
      prompt: essay.promptText,
      promptOnly: true,
    });
  };

  return (
    <>
      <Head>
        <title>{`${essay.seoTitle} | IELTS-Bank`}</title>
        <meta name="description" content={essay.excerpt} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={essay.seoTitle} />
        <meta property="og:description" content={essay.excerpt} />
        <meta property="og:url" content={canonical} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={essay.seoTitle} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={essay.seoTitle} />
        <meta name="twitter:description" content={essay.excerpt} />
        <meta name="twitter:image" content={ogImage} />
        <meta name="twitter:image:alt" content={essay.seoTitle} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      </Head>

      <div className="flex min-h-screen flex-col bg-secondary/40">
        <Navbar />
        <main className="flex-1">
          <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 md:py-12 lg:px-8">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              <NextLink href="/" className="no-underline hover:text-foreground">Home</NextLink>
              <span aria-hidden="true">/</span>
              <NextLink href="/ielts-essay-bank" className="no-underline hover:text-foreground">IELTS Essay Bank</NextLink>
              <span aria-hidden="true">/</span>
              <span className="text-foreground">{essay.title} — Band {band}</span>
            </nav>

            <article className="mt-5 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-8">
              {/* ========================== HEADER ========================== */}
              <header className="border-b border-border pb-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                  IELTS Essay Bank · {taskLabel(essay.bucket)} · {questionTypeLabel(essay.type)}
                </p>
                <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
                  {essay.title}: Band {band} Sample {kind === 'essay' ? 'Essay' : kind === 'letter' ? 'Letter' : 'Answer'}
                </h1>
                <p className="mt-3 text-sm text-muted-foreground">
                  {essay.wordCount} words · Topic: {essay.topics.map(topicLabel).join(', ')} ·{' '}
                  <time dateTime={toIsoDate(essay.date) || undefined}>{essay.date}</time>
                </p>

                {/* Band summary */}
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <div className={cn('col-span-2 flex flex-col justify-center rounded-lg p-4 ring-1 sm:col-span-1', bandTone(essay.band))}>
                    <span className="text-xs font-semibold uppercase tracking-wide">Overall</span>
                    <span className="text-3xl font-bold">{band}</span>
                  </div>
                  {essay.criteria.map((c) => (
                    <a
                      key={c.key}
                      href={`#criterion-${c.key}`}
                      className="rounded-lg border border-border bg-background p-3 no-underline hover:border-accent/50"
                    >
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" title={c.label}>
                        {c.abbr}
                      </span>
                      <span className="block text-xl font-bold text-foreground">{c.band}</span>
                      <span className="block text-[11px] leading-tight text-muted-foreground">{c.label}</span>
                    </a>
                  ))}
                </div>

                {/* Same prompt at other bands */}
                {siblings.length > 1 ? (
                  <div className="mt-5 flex flex-wrap items-center gap-2" aria-label="Compare bands">
                    <span className="text-sm font-semibold text-foreground">Compare the same question at:</span>
                    {siblings.map((s) =>
                      s.slug === essay.slug ? (
                        <span
                          key={s.slug}
                          aria-current="page"
                          className="rounded-full bg-foreground px-3 py-1 text-sm font-semibold text-background"
                        >
                          Band {formatBand(s.band)}
                        </span>
                      ) : (
                        <NextLink
                          key={s.slug}
                          href={`/ielts-essay-bank/${s.slug}`}
                          className="rounded-full border border-border px-3 py-1 text-sm font-semibold text-foreground no-underline hover:border-accent hover:text-accent"
                        >
                          Band {formatBand(s.band)}
                        </NextLink>
                      )
                    )}
                  </div>
                ) : null}
              </header>

              {/* ========================== PROMPT ========================== */}
              <section aria-labelledby="prompt-heading" className="mt-6 rounded-lg border border-border bg-secondary/50 p-5">
                <h2 id="prompt-heading" className="text-sm font-bold uppercase tracking-wide text-foreground">
                  The question
                </h2>
                <div className={cn(PROSE, 'mt-3')} dangerouslySetInnerHTML={{ __html: essay.promptHtml }} />
              </section>

              {/* ========================== ESSAY =========================== */}
              <section aria-labelledby="answer-heading" className="mt-8">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <h2 id="answer-heading" className="text-xl font-bold text-foreground">
                    Band {band} sample {kind}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    <mark className="rounded bg-amber-100 px-1 text-foreground">Highlighted</mark> = useful vocabulary
                  </span>
                </div>
                <div className={cn(ESSAY_PROSE, 'mt-4')} dangerouslySetInnerHTML={{ __html: essay.essayHtml }} />
                <p className="text-xs text-muted-foreground">Word count: {essay.wordCount}</p>
              </section>

              {/* ======================= PRIMARY CTA ======================== */}
              <div className="mt-8 flex flex-col gap-4 rounded-xl border border-accent/30 bg-accent/5 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-base font-bold text-foreground">Write your own answer → get an AI band score</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The same question is ready on its practice page, with a Band 8–9 model answer to compare.
                  </p>
                </div>
                <Button asChild variant="accent" size="lg" className="shrink-0">
                  <NextLink href={practiceHref} className="no-underline" onClick={() => onPracticeClick('after_essay')}>
                    <PenLine className="h-4 w-4" aria-hidden="true" />
                    Answer this question
                  </NextLink>
                </Button>
              </div>

              {/* ===================== EXAMINER COMMENTS ==================== */}
              <section aria-labelledby="comments-heading" className="mt-10">
                <h2 id="comments-heading" className="flex items-center gap-2 text-xl font-bold text-foreground">
                  <BookOpenCheck className="h-5 w-5 text-accent" aria-hidden="true" />
                  Why this is Band {band}: criterion by criterion
                </h2>
                <div className="mt-5 space-y-4">
                  {essay.criteria.map((c) => (
                    <div key={c.key} id={`criterion-${c.key}`} className="scroll-mt-24 rounded-xl border border-border p-5">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-base font-semibold text-foreground">{c.label}</h3>
                        <span className={cn('rounded-full px-3 py-0.5 text-sm font-bold ring-1', bandTone(c.band))}>
                          Band {c.band}
                        </span>
                      </div>
                      <div className={cn(PROSE, 'mt-2 [&_p:last-child]:mb-0')} dangerouslySetInnerHTML={{ __html: c.commentHtml }} />
                    </div>
                  ))}
                </div>
              </section>

              {/* ========================= VOCABULARY ======================== */}
              <section aria-labelledby="vocab-heading" className="mt-10">
                <h2 id="vocab-heading" className="text-xl font-bold text-foreground">
                  Useful vocabulary and collocations
                </h2>
                <dl className="mt-4 divide-y divide-border rounded-xl border border-border">
                  {essay.vocabulary.map((v) => (
                    <div key={v.term} className="grid gap-1 p-4 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-4">
                      <dt className="font-semibold text-foreground">
                        <mark className="rounded bg-amber-100 px-1 text-foreground">{v.term}</mark>
                      </dt>
                      <dd className="text-sm leading-6 text-muted-foreground" dangerouslySetInnerHTML={{ __html: v.noteHtml }} />
                    </div>
                  ))}
                </dl>
              </section>

              {/* ========================= NEXT BAND ========================= */}
              <section aria-labelledby="next-heading" className="mt-10">
                <h2 id="next-heading" className="flex items-center gap-2 text-xl font-bold text-foreground">
                  <TrendingUp className="h-5 w-5 text-accent" aria-hidden="true" />
                  How this {kind} could reach Band {nextBand}
                </h2>
                <ol className="mt-4 space-y-3">
                  {essay.nextBandHtml.map((note, i) => (
                    <li key={note} className="flex gap-3 rounded-xl border border-border bg-background p-4">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                        {i + 1}
                      </span>
                      <span className={cn(PROSE, 'leading-7')} dangerouslySetInnerHTML={{ __html: note }} />
                    </li>
                  ))}
                </ol>
              </section>

              <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
                This is an original sample {kind} written by IELTS-Bank to illustrate Band {band} against the public
                IELTS Writing band descriptors. The band scores are our assessment, not an official IELTS result.
                IELTS-Bank is not affiliated with, endorsed by, or connected to the British Council, IDP: IELTS
                Australia, or Cambridge University Press &amp; Assessment. &quot;IELTS&quot; is a registered trademark
                of its respective owners and is used here for descriptive purposes only.
              </p>

              <ShareRow
                className="mt-6 justify-start border-t border-border pt-6"
                label="Share this sample"
                source="essay_bank"
                path={`/ielts-essay-bank/${essay.slug}`}
                text={essay.seoTitle}
              />
            </article>

            <AdUnit />

            {/* ========================= FINAL CTA ========================= */}
            <section className="mt-2 rounded-2xl border border-accent/30 bg-card p-6 shadow-sm sm:p-8">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Write your own answer → get an AI band score
              </h2>
              <p className="mt-2 text-base leading-7 text-muted-foreground">
                Reading a sample only helps once you have committed to your own answer. Write it under exam
                timing ({essay.task === 1 ? '20' : '40'} minutes), then get a band estimate for all four criteria.
                Your first Writing score is free after you create an account.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button asChild variant="accent" size="lg">
                  <NextLink href={practiceHref} className="no-underline" onClick={() => onPracticeClick('footer')}>
                    <PenLine className="h-4 w-4" aria-hidden="true" />
                    Answer this question
                  </NextLink>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <NextLink href="/ielts-writing-checker?entry=essay_bank" onClick={onCheckerClick} className="no-underline">
                    Use it in the Writing Checker
                  </NextLink>
                </Button>
              </div>
            </section>

            {/* ========================== RELATED ========================== */}
            {related.length ? (
              <section aria-labelledby="related-heading" className="mt-10">
                <h2 id="related-heading" className="text-xl font-bold text-foreground">Related sample answers</h2>
                <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {related.map((r) => (
                    <li key={r.slug}>
                      <NextLink
                        href={`/ielts-essay-bank/${r.slug}`}
                        className="group flex h-full flex-col rounded-xl border border-border bg-card p-4 no-underline shadow-sm hover:border-accent/50"
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-foreground group-hover:text-accent">{r.title}</span>
                          <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1', bandTone(r.band))}>
                            Band {formatBand(r.band)}
                          </span>
                        </span>
                        <span className="mt-1 text-xs text-muted-foreground">
                          {taskLabel(r.bucket)} · {questionTypeLabel(r.type)}
                        </span>
                      </NextLink>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="mt-10 text-center">
              <NextLink
                href="/ielts-essay-bank"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent no-underline hover:text-accent/80"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to the IELTS Essay Bank
                <ArrowRight className="h-4 w-4 opacity-0" aria-hidden="true" />
              </NextLink>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
}

export async function getStaticPaths() {
  return {
    paths: essays.map((essay) => ({ params: { slug: essay.slug } })),
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const essay = getEssayBySlug(params.slug);
  if (!essay) return { notFound: true };
  const siblings = essays
    .filter((e) => e.practice === essay.practice)
    .map((e) => ({ slug: e.slug, band: e.band }))
    .sort((a, b) => a.band - b.band);
  return { props: { essay, siblings, related: relatedEssays(essay, 6) } };
}

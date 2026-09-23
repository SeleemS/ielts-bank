// Task-specific AI Writing Checker landing pages:
//   /ielts-writing-checker/task-2, /task-1 (Academic reports),
//   /general-training-letter
// The same checker as /ielts-writing-checker, locked to one task, wrapped in
// server-rendered guidance unique to that task (lib/writingCheckerTasks.js).
import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { ArrowRight, CheckCircle2, Clock, FileText, Sparkles, TriangleAlert } from 'lucide-react';
import Navbar from '../../src/components/Navbar';
import Footer from '../../src/components/Footer';
import Breadcrumbs from '../../src/components/Breadcrumbs';
import WritingCheckerTool from '../../src/components/writingChecker/WritingCheckerTool';
import { WRITING_CHECKER_TASK_LINKS } from '../../lib/writingCheckerSeo';
import { formatBand } from '../../lib/essayTaxonomy';
import { freeScoreCopy } from '../../lib/freeScorePeriod';
// Server-only: referenced ONLY inside getStaticPaths/getStaticProps, so Next
// strips them (and `fs`) from the client bundle.
import { essays } from '../../lib/essays';
import {
  WRITING_CHECKER_TASK_SLUGS,
  buildWritingCheckerTaskJsonLd,
  checkerTaskBreadcrumbs,
  getWritingCheckerTaskPage,
  pickCheckerSamples,
} from '../../lib/writingCheckerTasks';

function Section({ id, title, intro, children, tinted = false }) {
  return (
    <section id={id} className={tinted ? 'border-t border-border bg-secondary/30' : 'border-t border-border'}>
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        {intro ? <p className="mt-2 max-w-3xl leading-relaxed text-muted-foreground">{intro}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
    </section>
  );
}

export default function WritingCheckerTaskPage({ page, samples, jsonLd, breadcrumbs }) {
  const otherCheckers = WRITING_CHECKER_TASK_LINKS.filter((link) => link.slug !== page.slug);

  return (
    <>
      <Head>
        <title>{page.title}</title>
        <meta name="description" content={page.description} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={page.canonical} />
        <meta property="og:title" content={page.title} />
        <meta property="og:description" content={page.description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={page.canonical} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={page.ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={page.imageAlt} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={page.title} />
        <meta name="twitter:description" content={page.description} />
        <meta name="twitter:image" content={page.ogImage} />
        <meta name="twitter:image:alt" content={page.imageAlt} />
        {jsonLd.map((block) => (
          <script
            key={block['@type']}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(block).replace(/</g, '\\u003c') }}
          />
        ))}
      </Head>

      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />

        <main className="flex-1">
          {/* Hero */}
          <section className="border-b border-border bg-secondary/40">
            <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
              <Breadcrumbs items={breadcrumbs.map((item, i) => (i === breadcrumbs.length - 1 ? { label: item.label } : item))} />
              <div className="mt-6 text-center">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  {page.eyebrow}
                </span>
                <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
                  {page.h1}
                </h1>
                <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                  {page.intro} {freeScoreCopy().checkerFreeLine}
                </p>
                <p className="mt-4 text-sm text-muted-foreground">
                  Checking a different task?{' '}
                  {otherCheckers.map((link, i) => (
                    <React.Fragment key={link.href}>
                      {i > 0 ? ' · ' : null}
                      <NextLink href={link.href} className="font-semibold text-accent">
                        {link.label}
                      </NextLink>
                    </React.Fragment>
                  ))}
                </p>
              </div>
            </div>
          </section>

          <WritingCheckerTool
            lockedTaskType={page.lockedTaskType}
            variant={page.slug}
            essayLabel={page.essayLabel}
            promptPlaceholder={page.promptPlaceholder}
          />

          <Section id="criteria" title={`What the checker evaluates in ${page.taskName}`} intro={page.criteriaIntro} tinted>
            <ul className="grid gap-4 sm:grid-cols-2">
              {page.criteria.map((criterion) => (
                <li key={criterion.name} className="list-none rounded-xl border border-border bg-card p-5 shadow-sm">
                  <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    {criterion.name}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{criterion.body}</p>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="common-mistakes" title="Common mistakes the checker flags">
            <ul className="grid gap-4 sm:grid-cols-2">
              {page.mistakes.map((mistake) => (
                <li key={mistake.title} className="list-none rounded-xl border border-border bg-card p-5 shadow-sm">
                  <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
                    <TriangleAlert className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                    {mistake.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{mistake.body}</p>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="word-count" title={`Word count and timing: ${page.wordRules.minimum} words in ${page.wordRules.minutes} minutes`} tinted>
            <ul className="space-y-3">
              {page.wordRules.points.map((point) => (
                <li key={point} className="flex gap-3 text-sm leading-relaxed text-foreground">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </Section>

          {samples.length > 0 ? (
            <Section id="samples" title="Sample answers to compare with" intro={page.samplesIntro}>
              <ul className="grid gap-4 md:grid-cols-3">
                {samples.map((sample) => (
                  <li key={sample.slug} className="list-none">
                    <div className="flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
                      <span className="inline-flex w-fit items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-bold text-accent">
                        Band {formatBand(sample.band)}
                      </span>
                      <h3 className="mt-3 text-base font-bold leading-snug text-foreground">
                        <NextLink href={sample.href} className="text-foreground no-underline hover:text-accent">
                          {sample.title}
                        </NextLink>
                      </h3>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{sample.opening}</p>
                      <p className="mt-3 text-xs text-muted-foreground">{sample.wordCount} words</p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <NextLink href={sample.href} className="inline-flex items-center gap-1 font-semibold text-accent no-underline">
                          <FileText className="h-4 w-4" aria-hidden="true" /> Read with comments
                        </NextLink>
                        {sample.practiceHref ? (
                          <NextLink href={sample.practiceHref} className="font-semibold text-accent no-underline">
                            Try this question
                          </NextLink>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sm text-muted-foreground">
                More in the{' '}
                <NextLink href="/ielts-essay-bank" className="font-semibold text-accent">
                  IELTS essay bank
                </NextLink>{' '}
                and the{' '}
                <NextLink href="/writingquestion" className="font-semibold text-accent">
                  Writing practice prompts
                </NextLink>
                . For how the bands are defined, see the{' '}
                <NextLink href="/ielts-band-descriptors" className="font-semibold text-accent">
                  band descriptors
                </NextLink>{' '}
                and{' '}
                <NextLink href="/ielts-writing-checker-accuracy" className="font-semibold text-accent">
                  how accurate the AI score is
                </NextLink>
                .
              </p>
            </Section>
          ) : null}

          <Section id="faq" title="Frequently asked questions" tinted>
            <div className="space-y-4">
              {page.faq.map((item) => (
                <div key={item.q} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                  <h3 className="text-base font-bold text-foreground">{item.q}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section id="other-checkers" title="Other IELTS Writing checkers">
            <ul className="grid gap-4 sm:grid-cols-3">
              {[{ href: '/ielts-writing-checker', label: 'All-task Writing Checker', blurb: 'Choose any task type, including Task 1 and Task 2, on one page.' }, ...otherCheckers].map((link) => (
                <li key={link.href} className="list-none">
                  <NextLink
                    href={link.href}
                    className="group flex h-full flex-col rounded-xl border border-border bg-card p-5 no-underline shadow-sm transition-colors hover:border-accent/40"
                  >
                    <span className="text-base font-bold text-foreground group-hover:text-accent">{link.label}</span>
                    <span className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{link.blurb}</span>
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent">
                      Open <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </NextLink>
                </li>
              ))}
            </ul>
          </Section>
        </main>

        <Footer />
      </div>
    </>
  );
}

export async function getStaticPaths() {
  return {
    paths: WRITING_CHECKER_TASK_SLUGS.map((task) => ({ params: { task } })),
    fallback: false,
  };
}

// Fully static: the copy lives in the repo and the essay-bank samples are
// markdown files, so there is nothing to revalidate between deploys.
export async function getStaticProps({ params }) {
  const page = getWritingCheckerTaskPage(params.task);
  if (!page) return { notFound: true };
  return {
    props: {
      page,
      samples: pickCheckerSamples(page, essays),
      jsonLd: buildWritingCheckerTaskJsonLd(page),
      breadcrumbs: checkerTaskBreadcrumbs(page),
    },
  };
}

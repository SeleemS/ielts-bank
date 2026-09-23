import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { AlertTriangle, ArrowRight, Clock, Eye, EyeOff, ListChecks } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import AdUnit from '../components/AdUnit';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { sanitizeHtml } from '../../lib/sanitize';
import { formatBand } from '../../lib/bandTables';
import {
  answerPageDescription,
  answerPageJsonLd,
  answerPageTitle,
  answersPath,
  practicePath,
} from '../../lib/answerKeys';
import { track } from '../lib/analytics';
import { SITE_URL } from '../../lib/site';

// Answer-key page for one Reading/Listening passage. Everything (answers,
// explanations, evidence) is in the server HTML so it is crawlable and works
// without JavaScript; answers sit inside closed <details> so a learner who
// has not practised yet is not spoiled by a glance, and one button reveals
// them all.

const SKILL_COPY = {
  reading: {
    name: 'Reading',
    source: 'passage',
    timing: '20-minute timer',
    cta: 'Take this test first (timed)',
  },
  listening: {
    name: 'Listening',
    source: 'recording',
    timing: 'audio + 10 minutes to check',
    cta: 'Take this test first (with audio)',
  },
};

// Full-width, wrapping CTAs on phones (the long "Take this test first (with
// audio)" label otherwise overflows a 375px viewport); natural width from sm.
const CTA_BUTTON_CLASS = 'h-auto min-h-11 w-full whitespace-normal px-5 py-2 text-center sm:w-auto sm:px-8';

function AnswerBody({ question }) {
  return (
    <div className="mt-3 space-y-3 text-sm leading-relaxed">
      <p className="text-foreground">
        <span className="font-semibold text-accent">Answer: </span>
        <span className="font-semibold">{question.answerFull || question.answer}</span>
        {question.alsoAccepted.length ? (
          <span className="text-muted-foreground">
            {' '}
            (also accepted: {question.alsoAccepted.join(' / ')})
          </span>
        ) : null}
      </p>
      {question.reasoning ? (
        <p className="text-foreground">
          <span className="font-semibold">Why: </span>
          {question.reasoning}
        </p>
      ) : null}
      {question.explanationHtml ? (
        <p className="text-foreground">
          <span className="font-semibold">Why: </span>
          <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(question.explanationHtml) }} />
        </p>
      ) : null}
      {question.evidence ? (
        <figure className="rounded-md border-l-4 border-accent/60 bg-secondary/60 px-3 py-2">
          <figcaption className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {question.evidence.label} · {question.evidence.location}
          </figcaption>
          <blockquote className="italic text-foreground">“{question.evidence.quote}”</blockquote>
        </figure>
      ) : null}
    </div>
  );
}

function QuestionAnswer({ question }) {
  return (
    <li id={`answer-${question.number}`} className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
          {question.number}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-relaxed text-foreground">
            {question.prompt || `Gap ${question.number}`}
            {question.wordLimit ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                (max {question.wordLimit} word{question.wordLimit > 1 ? 's' : ''})
              </span>
            ) : null}
          </p>
          <details className="group mt-2" data-answer-details>
            <summary className="cursor-pointer select-none text-sm font-semibold text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="group-open:hidden">Show answer</span>
              <span className="hidden group-open:inline">Hide answer</span>
            </summary>
            <AnswerBody question={question} />
          </details>
        </div>
      </div>
    </li>
  );
}

function GroupAnswers({ group }) {
  return (
    <section className="mb-8" aria-labelledby={`group-${group.id}`}>
      <div className="mb-3">
        <h3 id={`group-${group.id}`} className="text-base font-bold text-foreground">
          {group.range}: {group.typeLabel}
        </h3>
        {group.prompt ? <p className="mt-1 text-sm text-muted-foreground">{group.prompt}</p> : null}
        {group.instructions && group.instructions !== group.prompt ? (
          <p className="mt-1 text-sm text-muted-foreground">{group.instructions}</p>
        ) : null}
      </div>
      {group.options.length ? (
        <div className="mb-3 rounded-md border border-border bg-card p-3">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Options
          </div>
          <ul className="grid gap-1 text-sm text-foreground">
            {group.options.map((opt) => (
              <li key={opt.key}>
                <span className="font-semibold">{opt.key}.</span> {opt.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ol className="grid list-none gap-3 p-0">
        {group.questions.map((question) => (
          <QuestionAnswer key={question.number} question={question} />
        ))}
      </ol>
    </section>
  );
}

export default function AnswerKeyPage({ answerKey, related = [] }) {
  const containerRef = React.useRef(null);
  const [revealed, setRevealed] = React.useState(false);
  if (!answerKey) return null;

  const copy = SKILL_COPY[answerKey.skill] || SKILL_COPY.reading;
  const pageTitle = answerPageTitle(answerKey.title, answerKey.skill);
  const description = answerPageDescription(answerKey);
  const canonicalUrl = `${SITE_URL}${answerKey.answersHref}`;
  const jsonLd = answerPageJsonLd(answerKey, { description });
  const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(
    `${answerKey.title} — Answers`
  )}&type=${answerKey.skill}&subtitle=${encodeURIComponent('Answers & explanations')}`;
  const moduleLabel =
    answerKey.skill === 'reading'
      ? answerKey.module === 'general'
        ? 'General Training'
        : 'Academic'
      : answerKey.listeningPart
        ? `Part ${answerKey.listeningPart}`
        : null;

  const onTakeTest = (placement) =>
    track('answers_take_test_click', {
      skill: answerKey.skill,
      slug: answerKey.slug,
      placement,
    });

  const toggleAll = () => {
    const next = !revealed;
    containerRef.current
      ?.querySelectorAll('details[data-answer-details]')
      .forEach((el) => {
        el.open = next;
      });
    setRevealed(next);
    track('answers_reveal_all', { skill: answerKey.skill, slug: answerKey.slug, open: next });
  };

  const allQuestions = answerKey.groups.flatMap((g) => g.questions);

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={description} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={`${answerKey.title}: IELTS ${copy.name} answers`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImage} />
        <meta name="twitter:image:alt" content={`${answerKey.title}: IELTS ${copy.name} answers`} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      </Head>

      <div className="min-h-screen bg-background">
        <Navbar />

        <main ref={containerRef} className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <NextLink href="/" className="hover:text-foreground">
                  Home
                </NextLink>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <NextLink href={`/${answerKey.skill}question`} className="hover:text-foreground">
                  IELTS {copy.name}
                </NextLink>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <NextLink href={answerKey.practiceHref} className="hover:text-foreground">
                  {answerKey.title}
                </NextLink>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-foreground">
                Answers
              </li>
            </ol>
          </nav>

          <header className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {answerKey.title}: {copy.name} Answers &amp; Explanations
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              IELTS {copy.name} practice test · {answerKey.total} questions
              {moduleLabel ? <Badge variant="secondary">{moduleLabel}</Badge> : null}
              {answerKey.difficulty ? (
                <Badge variant="emerald" className="capitalize">
                  {answerKey.difficulty}
                </Badge>
              ) : null}
            </p>
          </header>

          {/* Spoiler warning + primary CTA back to the timed practice page. */}
          <section
            aria-label="Before you look at the answers"
            className="mb-8 rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-500/40 dark:bg-amber-500/10"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-foreground">Haven&apos;t taken this test yet?</h2>
                <p className="mt-1 text-sm leading-relaxed text-foreground">
                  Looking at the answers first spoils the practice — you only get one honest first
                  attempt at a {copy.source}. Take the test with the {copy.timing}, get an instant
                  score and estimated band, then come back here to study every answer.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button asChild variant="accent" size="lg" className={CTA_BUTTON_CLASS}>
                    <NextLink
                      href={answerKey.practiceHref}
                      onClick={() => onTakeTest('top')}
                      data-analytics-id="answers-take-test-top"
                    >
                      <Clock aria-hidden="true" /> {copy.cta}
                    </NextLink>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className={CTA_BUTTON_CLASS}
                    onClick={toggleAll}
                    aria-controls="answer-key"
                    data-analytics-id="answers-reveal-all"
                  >
                    {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    {revealed ? 'Hide all answers' : 'Reveal all answers'}
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section aria-labelledby="about-heading" className="mb-8">
            <h2 id="about-heading" className="text-xl font-bold tracking-tight text-foreground">
              About this {copy.source}
            </h2>
            {answerKey.summary.lead ? (
              <p className="mt-2 text-sm leading-relaxed text-foreground">
                <span className="font-semibold">
                  {answerKey.skill === 'listening' ? 'The recording opens: ' : 'The passage opens: '}
                </span>
                “{answerKey.summary.lead}”
              </p>
            ) : null}
            <ul className="mt-3 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
              <li>
                {answerKey.skill === 'listening' ? 'Transcript length' : 'Passage length'}: about{' '}
                {answerKey.summary.wordCount.toLocaleString('en-US')} words
              </li>
              <li>Questions: {answerKey.summary.questionCount}</li>
              <li className="sm:col-span-2">
                Question types: {answerKey.summary.typeLabels.join(', ')}
              </li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              “{answerKey.title}” is an original IELTS-style practice {copy.source} written by
              IELTS-Bank. It is not taken from an official IELTS or Cambridge test, so these answers
              only apply to our version.
            </p>
          </section>

          <section aria-labelledby="glance-heading" className="mb-8">
            <h2 id="glance-heading" className="text-xl font-bold tracking-tight text-foreground">
              Answer key at a glance
            </h2>
            <details className="mt-3 rounded-lg border border-border bg-card" data-answer-details>
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ListChecks className="h-4 w-4 text-accent" aria-hidden="true" />
                Show the quick answer list (questions 1–{answerKey.total})
              </summary>
              <ol className="grid list-none grid-cols-1 gap-x-6 gap-y-1 border-t border-border px-4 py-3 text-sm sm:grid-cols-2">
                {allQuestions.map((q) => (
                  <li key={q.number} className="text-foreground">
                    <a href={`#answer-${q.number}`} className="font-semibold text-accent no-underline">
                      {q.number}.
                    </a>{' '}
                    {q.answer}
                  </li>
                ))}
              </ol>
            </details>
          </section>

          <section id="answer-key" aria-labelledby="answers-heading" className="mb-8">
            <h2 id="answers-heading" className="mb-4 text-xl font-bold tracking-tight text-foreground">
              {answerKey.title} answers with explanations
            </h2>
            {answerKey.groups.map((group) => (
              <GroupAnswers key={group.id} group={group} />
            ))}
          </section>

          <AdUnit />

          <section aria-labelledby="band-heading" className="mb-8">
            <h2 id="band-heading" className="text-xl font-bold tracking-tight text-foreground">
              Estimated band score for this test
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Your raw score out of {answerKey.total} scaled to the 40-question IELTS {copy.name}{' '}
              {answerKey.skill === 'reading'
                ? `(${answerKey.module === 'general' ? 'General Training' : 'Academic'}) `
                : ''}
              conversion table. This is the same estimate the practice page shows after you submit.
              A single {copy.source} is a small sample, so treat it as a guide.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full max-w-md border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th scope="col" className="py-2 pr-4 font-semibold text-foreground">
                      Correct answers
                    </th>
                    <th scope="col" className="py-2 font-semibold text-foreground">
                      Estimated band
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {answerKey.bandRows.map((row) => (
                    <tr key={`${row.min}-${row.max}`} className="border-b border-border/60">
                      <td className="py-1.5 pr-4 tabular-nums text-foreground">
                        {row.min === row.max ? row.max : `${row.min}–${row.max}`} / {answerKey.total}
                      </td>
                      <td className="py-1.5 tabular-nums text-foreground">{formatBand(row.band)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Full-test score?{' '}
              <NextLink href="/band-calculator" className="font-semibold text-accent">
                Use the IELTS band calculator
              </NextLink>
              .
            </p>
          </section>

          {answerKey.tips.length ? (
            <section aria-labelledby="tips-heading" className="mb-8">
              <h2 id="tips-heading" className="text-xl font-bold tracking-tight text-foreground">
                Tips for the question types in this test
              </h2>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {answerKey.tips.map((tip) => (
                  <div key={tip.key} className="rounded-lg border border-border bg-card p-4">
                    <h3 className="font-semibold text-foreground">{tip.label}</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
                      {tip.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                    {tip.trap ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">Common trap: </span>
                        {tip.trap}
                      </p>
                    ) : null}
                    <NextLink
                      href={tip.href}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent no-underline"
                    >
                      Full {tip.label} strategy <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </NextLink>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mb-10 rounded-xl border border-accent/30 bg-accent/5 p-5 text-center">
            <h2 className="text-lg font-bold text-foreground">Practise “{answerKey.title}” under exam conditions</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Free, auto-marked, with the {copy.timing} and an instant band estimate.
            </p>
            <Button asChild variant="accent" size="lg" className={`mt-4 ${CTA_BUTTON_CLASS}`}>
              <NextLink
                href={answerKey.practiceHref}
                onClick={() => onTakeTest('bottom')}
                data-analytics-id="answers-take-test-bottom"
              >
                {copy.cta} <ArrowRight aria-hidden="true" />
              </NextLink>
            </Button>
          </section>

          {related.length ? (
            <section aria-labelledby="related-heading" className="mb-10">
              <h2 id="related-heading" className="text-xl font-bold tracking-tight text-foreground">
                More IELTS {copy.name} tests with answers
              </h2>
              <ul className="mt-4 grid list-none gap-3 p-0 md:grid-cols-2">
                {related.map((item) => (
                  <li key={item.slug} className="rounded-lg border border-border bg-card p-4">
                    <h3 className="font-semibold text-foreground">{item.title}</h3>
                    {item.difficulty ? (
                      <p className="mt-1 text-xs capitalize text-muted-foreground">{item.difficulty}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold">
                      <NextLink
                        href={practicePath(answerKey.skill, item.slug)}
                        className="inline-flex items-center gap-1 text-accent no-underline"
                      >
                        Take the test <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </NextLink>
                      <NextLink
                        href={answersPath(answerKey.skill, item.slug)}
                        className="text-muted-foreground no-underline hover:text-foreground"
                      >
                        {item.title} answers
                      </NextLink>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </main>
        <Footer />
      </div>
    </>
  );
}

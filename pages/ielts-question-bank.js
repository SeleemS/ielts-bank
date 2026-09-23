// /ielts-question-bank — the whole practice bank on one page, with live
// counts per skill, question type and part (targets "ielts question bank",
// "ielts test bank", "ielts database"). Every number comes from the same
// lists the skill hubs render (lib/questionBankData.js), refreshed hourly.
import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { ArrowRight, BookOpen, Headphones, KeyRound, Layers, Mic, PenLine, Timer } from 'lucide-react';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';
import Breadcrumbs from '../src/components/Breadcrumbs';
import { SITE_URL } from '../lib/site';
import { WRITING_CHECKER_TASK_LINKS } from '../lib/writingCheckerSeo';
// Server-only: referenced ONLY inside getStaticProps, so Next strips them
// (Supabase list queries, fs-backed essay loader, the guide modules the
// count builder reads) from the client bundle. Keep it that way: using any of
// these in the component would ship them to the browser.
import { loadQuestionBankRaw } from '../lib/questionBankData';
import {
  QUESTION_BANK_CANONICAL,
  buildQuestionBankJsonLd,
  buildQuestionBankSummary,
  questionBankDescription,
  questionBankFaq,
  questionBankTitle,
} from '../lib/questionBank';

const SKILL_ICONS = { reading: BookOpen, listening: Headphones, writing: PenLine, speaking: Mic };

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

function Section({ id, title, intro, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-12">
      <h2 id={`${id}-title`} className="text-2xl font-bold tracking-tight text-foreground">
        {title}
      </h2>
      {intro ? <p className="mt-2 max-w-3xl leading-relaxed text-muted-foreground">{intro}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function LinkChips({ links }) {
  return (
    <ul className="flex flex-wrap gap-2.5">
      {links.map((link) => (
        <li key={link.href} className="list-none">
          <NextLink
            href={link.href}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground no-underline shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
          >
            {link.label}
            {link.count != null ? (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                {fmt(link.count)}
              </span>
            ) : null}
          </NextLink>
        </li>
      ))}
    </ul>
  );
}

export default function QuestionBankPage({ summary, title, description, faq, jsonLd, canonical }) {
  const { skills } = summary;
  const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent('IELTS Question Bank')}&type=guide&subtitle=${encodeURIComponent(`${fmt(summary.total)} free practice questions`)}`;
  const imageAlt = 'IELTS Question Bank — free practice questions with answers';
  const readingAndListening = skills.reading.questions + skills.listening.questions;

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
        <meta property="og:image:alt" content={imageAlt} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImage} />
        <meta name="twitter:image:alt" content={imageAlt} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      </Head>

      <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <Navbar />
        <main className="flex-1">
          <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
            <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'IELTS Question Bank' }]} />

            <header className="mt-6 max-w-3xl">
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                IELTS Question Bank: {fmt(summary.total)} free practice questions with answers
              </h1>
              <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">Quick answer</p>
                <p className="mt-1 leading-relaxed text-foreground">
                  IELTS-Bank is a free IELTS question bank of {fmt(summary.total)} practice questions:{' '}
                  {fmt(skills.reading.questions)} Reading questions across {fmt(skills.reading.items)} passages,{' '}
                  {fmt(skills.listening.questions)} Listening questions across {fmt(skills.listening.items)} recordings,{' '}
                  {fmt(skills.writing.items)} Writing prompts and {fmt(skills.speaking.items)} Speaking practice sets.
                  Reading and Listening are marked instantly with the correct answers shown; Writing and Speaking come
                  with model answers. All of it is original practice material in the IELTS format.
                </p>
              </div>
            </header>

            {/* Per-skill totals */}
            <section aria-label="Questions by skill" className="mt-10">
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(skills).map(([key, skill]) => {
                  const Icon = SKILL_ICONS[key];
                  return (
                    <li key={key} className="list-none">
                      <NextLink
                        href={skill.href}
                        className="group flex h-full flex-col rounded-xl border border-border bg-card p-5 no-underline shadow-sm transition-colors hover:border-accent/40"
                      >
                        <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                          <Icon className="h-4 w-4 text-accent" aria-hidden="true" /> IELTS {skill.label}
                        </span>
                        <span className="mt-2 text-3xl font-bold text-foreground">
                          {fmt(key === 'reading' || key === 'listening' ? skill.questions : skill.items)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {key === 'reading' || key === 'listening'
                            ? `questions in ${fmt(skill.items)} ${skill.unit}`
                            : skill.unit}
                        </span>
                        <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent">
                          Browse {skill.label} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                        </span>
                      </NextLink>
                    </li>
                  );
                })}
              </ul>
            </section>

            <Section
              id="reading-types"
              title="Reading questions by type"
              intro="Passages containing each IELTS Reading question type. Each hub explains the strategy and lists every passage where you can practise it."
            >
              <LinkChips links={summary.readingTypes} />
            </Section>

            <Section
              id="listening-parts"
              title="Listening tests by part"
              intro="Recordings for each of the four IELTS Listening parts, from everyday conversations (Part 1) to academic lectures (Part 4)."
            >
              <LinkChips links={summary.listeningParts} />
            </Section>

            <Section
              id="writing"
              title="Writing prompts, sample essays and checkers"
              intro={`${fmt(skills.writing.items)} Task 1 and Task 2 prompts, most with a Band 8–9 model answer, plus ${fmt(summary.essayBankCount)} band-scored samples in the essay bank.`}
            >
              <LinkChips
                links={[
                  { href: '/writingquestion', label: 'All Writing prompts', count: skills.writing.items },
                  { href: '/ielts-essay-bank', label: 'IELTS Essay Bank', count: summary.essayBankCount || null },
                  { href: '/ielts-writing-task-2-topics', label: 'Writing Task 2 topics' },
                  ...WRITING_CHECKER_TASK_LINKS.map((link) => ({ href: link.href, label: link.label })),
                ]}
              />
            </Section>

            <Section
              id="speaking"
              title="Speaking topics and cue cards"
              intro="Part 1 interview topics, Part 2 cue cards and Part 3 discussions, each with examiner audio and a model answer."
            >
              <LinkChips
                links={[
                  ...summary.speakingParts,
                  { href: '/ielts-speaking-cue-cards', label: 'All cue cards by topic', count: summary.cueCards },
                ]}
              />
            </Section>

            {summary.answerKeys.some((k) => k.count > 0) ? (
              <Section
                id="answer-keys"
                title="Answer keys with explanations"
                intro="Every practice page shows the correct answers after you submit. These passages also have a public answer-key page with an explanation for each answer."
              >
                <div className="grid gap-6 md:grid-cols-2">
                  {summary.answerKeys
                    .filter((key) => key.count > 0)
                    .map((key) => (
                      <div key={key.skill} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                        <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
                          <KeyRound className="h-4 w-4 text-accent" aria-hidden="true" />
                          {key.skill === 'reading' ? 'Reading' : 'Listening'} answer keys ({fmt(key.count)})
                        </h3>
                        <ul className="mt-3 space-y-1.5">
                          {key.links.map((link) => (
                            <li key={link.href} className="list-none text-sm">
                              <NextLink href={link.href} className="text-foreground no-underline hover:text-accent">
                                {link.label}
                              </NextLink>
                            </li>
                          ))}
                        </ul>
                        <NextLink
                          href={key.skill === 'reading' ? '/readingquestion' : '/listeningquestion'}
                          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent no-underline"
                        >
                          All {key.skill === 'reading' ? 'Reading passages' : 'Listening tests'} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </NextLink>
                      </div>
                    ))}
                </div>
              </Section>
            ) : null}

            <Section
              id="mock-tests"
              title="Timed mock tests"
              intro={`${summary.mockTestCount ? `${fmt(summary.mockTestCount)} full-length` : 'Full-length'} Reading and Listening mock tests under exam timing, for when you are ready to practise a whole section in one sitting.`}
            >
              <LinkChips
                links={[
                  { href: '/mock-test', label: 'Mock tests', count: summary.mockTestCount || null },
                  { href: '/band-calculator', label: 'Convert a raw score to a band' },
                  { href: '/ielts-test-format', label: 'IELTS test format' },
                ]}
              />
            </Section>

            <section aria-labelledby="about-bank" className="mt-12 rounded-2xl border border-border bg-secondary/40 p-6 sm:p-8">
              <h2 id="about-bank" className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
                <Layers className="h-5 w-5 text-accent" aria-hidden="true" /> What is in this question bank?
              </h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                The bank is original practice material written by IELTS-Bank to match the format, timing and question
                types of the IELTS test. It is not official Cambridge, British Council or IDP material and does not
                contain real exam papers, which are confidential. The {fmt(readingAndListening)} Reading and Listening
                questions are free to answer as often as you like; Writing prompts and Speaking sets are free to
                practise, and the AI band score for your own answer includes a free sample.
              </p>
              <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
                <Timer className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                Counts update automatically as new questions are published: each Reading and Listening question counts
                once, and each Writing prompt and Speaking set counts once.
              </p>
            </section>

            <Section id="faq" title="Frequently asked questions">
              <div className="space-y-4">
                {faq.map((item) => (
                  <div key={item.q} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <h3 className="text-base font-bold text-foreground">{item.q}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                  </div>
                ))}
              </div>
            </Section>

            <p className="mt-12 text-xs leading-relaxed text-muted-foreground">
              IELTS-Bank is an independent study resource and is not affiliated with, endorsed by, or connected to the
              British Council, IDP: IELTS Australia, or Cambridge University Press &amp; Assessment. &quot;IELTS&quot; is
              a registered trademark of its respective owners and is used here for descriptive purposes only.
            </p>
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
}

export async function getStaticProps() {
  const summary = buildQuestionBankSummary(await loadQuestionBankRaw());
  const title = questionBankTitle(summary.total);
  const description = questionBankDescription(summary);
  return {
    props: {
      summary,
      title,
      description,
      faq: questionBankFaq(summary),
      jsonLd: buildQuestionBankJsonLd(summary, title, description),
      canonical: QUESTION_BANK_CANONICAL,
    },
    // Counts follow the hubs: new passages and cue cards appear within the hour.
    revalidate: 3600,
  };
}

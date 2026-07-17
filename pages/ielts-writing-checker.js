import React, { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import {
  Sparkles,
  PenLine,
  Gauge,
  MessageSquareText,
  ArrowRight,
  ClipboardList,
  Wand2,
  ListChecks,
} from 'lucide-react';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';
import NewsletterSignup from '../src/components/NewsletterSignup';
import SignInDialog from '../src/components/auth/SignInDialog';
import { useAuth } from '../src/lib/auth';
import { getSupabase } from '../lib/supabase';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Select } from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Progress } from '../components/ui/progress';
import { cn } from '../src/lib/utils';
import { getAnonId, track } from '../src/lib/analytics';
import AiQuotaPanel from '../src/components/AiQuotaPanel';
import { ScoringProgress, CriterionFeedback } from '../src/components/question/ScoreUI';

const SITE_URL = 'https://ielts-bank.com';
const SCORE_API = '/api/score/writing';
const CANONICAL = `${SITE_URL}/ielts-writing-checker`;
const DRAFT_KEY = 'ielts-writing-checker-draft';

// Task-type options. The scoring API only distinguishes Task 1 vs Task 2, so
// both Task 1 variants map to apiTask=1; the label is passed to the model as
// part of the prompt text so it can apply the right expectations.
const TASK_TYPES = [
  { value: 'task1-academic', label: 'Task 1 — Academic', apiTask: 1, minWords: 150 },
  { value: 'task1-general', label: 'Task 1 — General Training', apiTask: 1, minWords: 150 },
  { value: 'task2', label: 'Task 2 — Essay', apiTask: 2, minWords: 250 },
];

const TASK2_CRITERIA = [
  ['taskResponse', 'Task Response'],
  ['coherenceCohesion', 'Coherence & Cohesion'],
  ['lexicalResource', 'Lexical Resource'],
  ['grammaticalRange', 'Grammatical Range & Accuracy'],
];
const TASK1_CRITERIA = [
  ['taskAchievement', 'Task Achievement'],
  ['coherenceCohesion', 'Coherence & Cohesion'],
  ['lexicalResource', 'Lexical Resource'],
  ['grammaticalRange', 'Grammatical Range & Accuracy'],
];

function formatBand(band) {
  return typeof band === 'number' ? band.toFixed(1) : '—';
}
function bandTone(band) {
  if (typeof band !== 'number') return 'bg-secondary text-secondary-foreground';
  if (band >= 7) return 'bg-accent text-accent-foreground';
  if (band >= 5.5) return 'bg-primary text-primary-foreground';
  return 'bg-destructive text-destructive-foreground';
}
function BandPill({ band, className }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-[2.75rem] items-center justify-center rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums',
        bandTone(band),
        className
      )}
    >
      {formatBand(band)}
    </span>
  );
}

// Mirrors the criterion-breakdown UI from the writing practice page
// (src/pages/WritingQuestion.js -> ScoreReport).
function ScoreReport({ apiTask, result }) {
  const criteriaMeta = apiTask === 1 ? TASK1_CRITERIA : TASK2_CRITERIA;
  const criteria = result.criteria || {};
  const improvements = Array.isArray(result.improvements) ? result.improvements : [];
  const corrected = Array.isArray(result.correctedExamples)
    ? result.correctedExamples
    : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-5 py-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Estimated Overall Band
          </div>
          <div className="text-xs text-muted-foreground">
            Writing Task {apiTask}
            {result.wordCount ? ` · ${result.wordCount} words` : ''}
          </div>
        </div>
        <span
          className={cn(
            'inline-flex h-14 w-14 items-center justify-center rounded-full text-2xl font-extrabold tabular-nums',
            bandTone(result.overallBand)
          )}
        >
          {formatBand(result.overallBand)}
        </span>
      </div>

      <div className="space-y-3">
        {criteriaMeta.map(([key, label]) => {
          const c = criteria[key] || {};
          return (
            <div key={key} className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-foreground">{label}</h3>
                <BandPill band={c.band} />
              </div>
              <CriterionFeedback criterion={c} />
            </div>
          );
        })}
      </div>

      {result.summary && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-1.5 text-sm font-bold text-foreground">Examiner Summary</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{result.summary}</p>
        </div>
      )}

      {improvements.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-bold text-foreground">How to Improve</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            {improvements.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {corrected.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-bold text-foreground">Corrected Examples</h3>
          <div className="space-y-3">
            {corrected.map((ex, i) => (
              <div key={i} className="rounded-md border border-border/70 bg-secondary/30 p-3">
                <p className="text-sm text-destructive line-through decoration-destructive/50">
                  {ex.original}
                </p>
                <p className="mt-1 text-sm font-medium text-accent">{ex.suggestion}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const HOW_IT_WORKS = [
  {
    icon: ClipboardList,
    title: 'Paste your essay',
    desc: 'Choose your task type, optionally add the question, and paste your Task 1 or Task 2 answer.',
  },
  {
    icon: Wand2,
    title: 'Get an instant AI score',
    desc: 'Our AI examiner marks your writing against all four official IELTS criteria in under a minute.',
  },
  {
    icon: ListChecks,
    title: 'See exactly what to fix',
    desc: 'Read criterion-by-criterion feedback, corrected examples and concrete tips to raise your band.',
  },
];

const FAQ = [
  {
    q: 'Is this the official IELTS score?',
    a: "No. This is an AI-generated estimate based on the public IELTS band descriptors. It is a study aid to help you improve — only a certified examiner in a real IELTS test can give you an official band score.",
  },
  {
    q: 'Is it free?',
    a: 'Yes, the writing checker is free to use. To keep costs sustainable there is a fair-use daily limit on how many essays can be scored, so very heavy usage may be temporarily paused.',
  },
  {
    q: 'Do you store my essay?',
    a: 'You sign in with a magic link before scoring, and your essay and its band score are saved to your account so you can review your progress on your dashboard. We do not sell or publish your writing, and you can request deletion at any time.',
  },
  {
    q: 'Which tasks can I check?',
    a: 'All of them: Academic Task 1 (graphs, charts, maps and processes), General Training Task 1 (letters), and Task 2 essays for both Academic and General Training.',
  },
];

const SAMPLE_FEEDBACK = {
  overallBand: 6.5,
  wordCount: 268,
  criteria: {
    taskResponse: {
      band: 6.5,
      feedback:
        'You address both views and give your opinion, and your position is clear throughout ("I firmly believe that…"). Some ideas, such as the paragraph on remote work, are asserted rather than fully developed with examples, which holds this back from band 7.',
    },
    coherenceCohesion: {
      band: 7,
      feedback:
        'Ideas are logically sequenced and paragraphing is effective. Linking words ("Furthermore", "On the other hand") are used accurately, though a few sentences over-rely on "and" to join clauses.',
    },
    lexicalResource: {
      band: 6,
      feedback:
        'You use some good topic vocabulary ("commute", "flexibility"), but there is repetition of "important" and a few collocation slips ("do a decision"). Widening your range of precise word choices would lift this score.',
    },
    grammaticalRange: {
      band: 6.5,
      feedback:
        'A mix of simple and complex sentences with generally good control. Occasional article and preposition errors ("in the last decade" written as "on the last decade") appear but rarely block meaning.',
    },
  },
  summary:
    'A solid, well-organised response with a clear position. To move toward band 7, develop each idea with a specific example and broaden your vocabulary to reduce repetition.',
};

export default function WritingCheckerPage() {
  const { user, loading } = useAuth();

  const [taskType, setTaskType] = useState('task2');
  const [prompt, setPrompt] = useState('');
  const [essay, setEssay] = useState('');
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [signInOpen, setSignInOpen] = useState(false);
  const [quotaOpen, setQuotaOpen] = useState(false);
  // True once the user has pressed submit while signed-out — after they sign in
  // we auto-restore the draft and let them submit again.
  const pendingSubmitRef = useRef(false);

  const active = TASK_TYPES.find((t) => t.value === taskType) || TASK_TYPES[2];
  const apiTask = active.apiTask;
  const minWords = active.minWords;

  const wordCount = essay.split(/\s+/).filter(Boolean).length;
  const progressValue = Math.min((wordCount / minWords) * 100, 100);
  const isSufficient = wordCount >= minWords;

  // Restore any saved draft (task type, prompt, essay) on mount. This is what
  // carries a signed-out user's work across the magic-link sign-in round-trip:
  // we persist before opening the sign-in dialog and restore here.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && typeof saved === 'object') {
        if (typeof saved.taskType === 'string') setTaskType(saved.taskType);
        if (typeof saved.prompt === 'string') setPrompt(saved.prompt);
        if (typeof saved.essay === 'string') setEssay(saved.essay);
      }
    } catch {
      /* ignore malformed draft */
    }
  }, []);

  // Persist the draft on every change so nothing is lost on navigation/auth.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ taskType, prompt, essay })
      );
    } catch {
      /* storage full / unavailable — non-fatal */
    }
  }, [taskType, prompt, essay]);

  const runScore = useCallback(async () => {
    setErrorMsg('');
    setResult(null);

    if (!isSufficient) {
      setErrorMsg(
        `Your answer must be at least ${minWords} words to be scored. Current word count: ${wordCount}.`
      );
      return;
    }

    setIsLoading(true);
    track('writing_submit', { skill: 'writing', slug: 'writing-checker', task: apiTask, word_count: wordCount, signed_in: Boolean(user) });
    try {
      const headers = { 'Content-Type': 'application/json' };
      try {
        const { data } = await getSupabase().auth.getSession();
        const accessToken = data?.session?.access_token;
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      } catch {
        /* not signed in / auth unavailable */
      }

      // Prepend the task-type label to the free-form prompt so the model knows
      // whether this is Academic Task 1, General Training Task 1, or Task 2.
      const promptText = [active.label, prompt.trim()].filter(Boolean).join('\n\n');

      const response = await fetch(SCORE_API, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: promptText,
          essay,
          task: apiTask,
          passage_id: null,
          anon_id: getAnonId(),
        }),
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        /* non-JSON error body */
      }

      if (response.ok && data) {
        setResult(data);
        track('ai_score_result', { skill: 'writing', slug: 'writing-checker', outcome: 'ok', band: data.overallBand, task: apiTask, word_count: wordCount, signed_in: Boolean(user) });
      } else if (response.status === 402 || response.status === 429) {
        setQuotaOpen(true);
        track('ai_score_result', { skill: 'writing', slug: 'writing-checker', outcome: 'rate_limited', task: apiTask, signed_in: Boolean(user) });
        setErrorMsg(
          (data && data.error) ||
            'You have reached the daily scoring limit. Please try again later.'
        );
      } else {
        track('ai_score_result', { skill: 'writing', slug: 'writing-checker', outcome: 'error', http_status: response.status, task: apiTask, signed_in: Boolean(user) });
        setErrorMsg((data && data.error) || 'Failed to score your essay. Please try again.');
      }
    } catch {
      track('ai_score_result', { skill: 'writing', slug: 'writing-checker', outcome: 'error', error_type: 'network', task: apiTask, signed_in: Boolean(user) });
      setErrorMsg('A network error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [active.label, apiTask, essay, isSufficient, minWords, prompt, user, wordCount]);

  // After a signed-out user completes the sign-in/onboarding dialog, run the
  // pending score automatically. This fires from onOpenChange when the dialog
  // CLOSES (not the moment the session appears) so the onboarding questions
  // inside the dialog aren't cut short.

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!isSufficient) {
      setErrorMsg(
        `Your answer must be at least ${minWords} words to be scored. Current word count: ${wordCount}.`
      );
      return;
    }

    // Signed-out: draft is already persisted by the effect above. Open the
    // existing magic-link sign-in dialog; scoring runs once they're signed in.
    if (!loading && !user) {
      pendingSubmitRef.current = true;
      setSignInOpen(true);
      return;
    }

    runScore();
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };

  const pageTitle = 'Free IELTS Writing Checker – Instant AI Band Score & Feedback';
  const metaDescription =
    'Free AI IELTS writing checker. Paste your Task 1 or Task 2 essay and get an instant estimated band score with feedback on Task Achievement, Coherence & Cohesion, Lexical Resource and Grammar.';

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={CANONICAL} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta name="twitter:card" content="summary_large_image" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, '\\u003c') }}
        />
      </Head>

      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />

        <main className="flex-1">
          {/* Hero */}
          <section className="border-b border-border bg-secondary/40">
            <div className="mx-auto max-w-4xl px-4 py-12 text-center sm:px-6 md:py-16 lg:px-8">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                Free AI tool
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
                Free AI IELTS Writing Checker
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Paste your essay and get an instant estimated band score with detailed
                feedback on all four IELTS criteria — Task Achievement / Response,
                Coherence &amp; Cohesion, Lexical Resource, and Grammatical Range &amp;
                Accuracy.
              </p>
            </div>
          </section>

          {/* Tool */}
          <section className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-7">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid gap-1.5">
                  <Label htmlFor="task-type">Task type</Label>
                  <Select
                    id="task-type"
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value)}
                  >
                    {TASK_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="prompt">
                    Question / prompt{' '}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Textarea
                    id="prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Paste the exact task question here for more accurate feedback…"
                    className="min-h-[80px] resize-y"
                  />
                </div>

                <div className="grid gap-1.5">
                  <div className="flex items-end justify-between gap-4">
                    <Label htmlFor="essay">Your essay</Label>
                    <div className="w-40">
                      <div
                        className={cn(
                          'mb-1 text-right text-xs font-medium',
                          isSufficient ? 'text-accent' : 'text-muted-foreground'
                        )}
                      >
                        {wordCount} / {minWords} words
                      </div>
                      <Progress
                        value={progressValue}
                        indicatorClassName={isSufficient ? 'bg-accent' : 'bg-primary'}
                      />
                    </div>
                  </div>
                  <Textarea
                    id="essay"
                    value={essay}
                    onChange={(e) => setEssay(e.target.value)}
                    placeholder="Paste or write your full response here…"
                    className="min-h-[280px] resize-y"
                  />
                  <p className="text-xs text-muted-foreground">
                    Aim for at least {minWords} words — the IELTS minimum for{' '}
                    {apiTask === 1 ? 'Task 1' : 'Task 2'}. Shorter answers are penalised.
                  </p>
                </div>

                {errorMsg && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {errorMsg}
                  </div>
                )}

                <Button
                  type="submit"
                  variant="accent"
                  size="lg"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading
                    ? 'Analyzing…'
                    : !loading && !user
                    ? 'Sign in & check my writing'
                    : 'Check my writing'}
                </Button>
                <AiQuotaPanel userId={user?.id} remaining={result?.quotaRemaining} open={quotaOpen} onClose={() => setQuotaOpen(false)} />
                {!loading && !user && (
                  <p className="text-center text-xs text-muted-foreground">
                    We&apos;ll email you a one-tap magic link to save your score. Your draft
                    is kept while you sign in.
                  </p>
                )}
              </form>
            </div>

            {/* Loading state */}
            {isLoading && (
              <div className="mt-6 rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
                <h2 className="mb-2 text-lg font-bold tracking-tight text-foreground">
                  Analyzing your response
                </h2>
                <ScoringProgress />
              </div>
            )}

            {/* Result */}
            {result && !isLoading && (
              <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-7">
                <h2 className="mb-4 text-lg font-bold tracking-tight text-foreground">
                  Your estimated score &amp; feedback
                </h2>
                <ScoreReport apiTask={apiTask} result={result} />
                <div className="mt-5 rounded-lg border border-accent/30 bg-accent/5 p-4">
                  <p className="text-sm font-semibold text-foreground">Put the feedback into practice</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Button variant="accent" onClick={() => { setResult(null); window.scrollTo({ top: 360, behavior: 'smooth' }); }}>Score another draft{result.quotaRemaining != null ? ` (${result.quotaRemaining} left)` : ''}</Button>
                    <Button asChild variant="outline"><NextLink href="/writingquestion">Choose a Writing task</NextLink></Button>
                  </div>
                </div>
                <p className="mt-4 rounded-md bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                  This is an AI estimate for study purposes, not an official IELTS result.
                </p>
              </div>
            )}
          </section>

          {/* How it works */}
          <section className="border-t border-border bg-secondary/30">
            <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
              <h2 className="text-center text-2xl font-bold tracking-tight text-foreground">
                How the writing checker works
              </h2>
              <div className="mt-8 grid gap-6 sm:grid-cols-3">
                {HOW_IT_WORKS.map((step, i) => {
                  const Icon = step.icon;
                  return (
                    <div
                      key={step.title}
                      className="rounded-xl border border-border bg-card p-6 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/5 ring-1 ring-primary/10">
                          <Icon className="h-5 w-5 text-primary" />
                        </span>
                        <span className="text-sm font-bold text-muted-foreground">
                          Step {i + 1}
                        </span>
                      </div>
                      <h3 className="mt-4 text-base font-bold text-foreground">{step.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {step.desc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Sample feedback */}
          <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                What your feedback looks like
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                A sample of the criterion-by-criterion breakdown you receive for a Task 2
                essay.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-7">
              <ScoreReport apiTask={2} result={SAMPLE_FEEDBACK} />
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Illustrative example. Your own feedback is generated from your essay.
              </p>
            </div>
          </section>

          {/* Feature strip / internal links */}
          <section className="border-t border-border bg-secondary/30">
            <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
              <div className="grid gap-6 sm:grid-cols-3">
                <div className="flex flex-col items-start gap-2">
                  <Gauge className="h-6 w-6 text-accent" />
                  <h3 className="text-base font-bold text-foreground">Instant band estimate</h3>
                  <p className="text-sm text-muted-foreground">
                    Get an overall band and per-criterion scores in under a minute.
                  </p>
                </div>
                <div className="flex flex-col items-start gap-2">
                  <MessageSquareText className="h-6 w-6 text-accent" />
                  <h3 className="text-base font-bold text-foreground">Actionable feedback</h3>
                  <p className="text-sm text-muted-foreground">
                    Corrected examples and concrete tips show you exactly what to fix.
                  </p>
                </div>
                <div className="flex flex-col items-start gap-2">
                  <PenLine className="h-6 w-6 text-accent" />
                  <h3 className="text-base font-bold text-foreground">Practise on real tasks</h3>
                  <p className="text-sm text-muted-foreground">
                    Prefer a real question?{' '}
                    <NextLink
                      href="/writingquestion"
                      className="font-medium text-accent underline underline-offset-2 hover:text-accent/80"
                    >
                      Browse the writing question bank
                    </NextLink>{' '}
                    or estimate your{' '}
                    <NextLink
                      href="/band-calculator"
                      className="font-medium text-accent underline underline-offset-2 hover:text-accent/80"
                    >
                      overall band score
                    </NextLink>
                    .
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Newsletter */}
          <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
            <NewsletterSignup source="writing-checker" variant="full" />
          </section>

          {/* FAQ */}
          <section className="border-t border-border">
            <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
              <h2 className="text-center text-2xl font-bold tracking-tight text-foreground">
                Frequently asked questions
              </h2>
              <div className="mt-8 space-y-4">
                {FAQ.map((item) => (
                  <div
                    key={item.q}
                    className="rounded-xl border border-border bg-card p-5 shadow-sm"
                  >
                    <h3 className="text-base font-bold text-foreground">{item.q}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                  </div>
                ))}
              </div>

              <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                <Button asChild variant="accent">
                  <NextLink href="/writingquestion" className="no-underline">
                    Practise writing tasks
                    <ArrowRight className="h-4 w-4" />
                  </NextLink>
                </Button>
                <Button asChild variant="outline">
                  <NextLink href="/band-calculator" className="no-underline">
                    Band score calculator
                  </NextLink>
                </Button>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>

      <SignInDialog
        open={signInOpen}
        onOpenChange={(v) => {
          setSignInOpen(v);
          if (!v) {
            const shouldRun = pendingSubmitRef.current && Boolean(user);
            pendingSubmitRef.current = false;
            if (shouldRun) runScore();
          }
        }}
        title="Sign in to check your writing"
        description="Create a free account to see your band score. Your draft is kept safe."
        trigger="writing_checker_score"
      />
    </>
  );
}

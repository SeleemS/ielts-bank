import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import confetti from 'canvas-confetti';
import Navbar from '../components/Navbar';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Progress } from '../../components/ui/progress';
import { cn } from '../lib/utils';
import { getSupabase } from '../../lib/supabase';

const SITE_URL = 'https://ielts-bank.com';
const SCORE_API = '/api/score/writing';
const PROMPT_HTML_CLASS =
  'text-[15px] leading-7 text-foreground [&_p]:mb-4 [&_strong]:font-semibold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_li]:mb-1';

// Strip HTML tags from the site's prompt markup to send plain text to the
// scorer (the model does not need the markup, and this keeps the payload lean).
function htmlToText(html) {
  if (!html) return '';
  if (typeof window !== 'undefined' && window.DOMParser) {
    try {
      const doc = new window.DOMParser().parseFromString(html, 'text/html');
      return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
    } catch {
      /* fall through */
    }
  }
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Criterion metadata: key in the API response -> display label.
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

function Modal({ open, onClose, title, children, dismissible = true }) {
  if (!open) return null;
  return (
    <div className="tw-root fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={dismissible ? onClose : undefined}
      />
      <div className="relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

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

function ScoreReport({ task, result }) {
  const criteriaMeta = task === 1 ? TASK1_CRITERIA : TASK2_CRITERIA;
  const criteria = result.criteria || {};
  const improvements = Array.isArray(result.improvements) ? result.improvements : [];
  const corrected = Array.isArray(result.correctedExamples)
    ? result.correctedExamples
    : [];

  return (
    <div className="space-y-5">
      {/* Overall band */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-5 py-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Overall Band
          </div>
          <div className="text-xs text-muted-foreground">
            Writing Task {task}
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

      {/* Per-criterion cards */}
      <div className="space-y-3">
        {criteriaMeta.map(([key, label]) => {
          const c = criteria[key] || {};
          return (
            <div key={key} className="rounded-lg border border-border bg-card p-4">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-foreground">{label}</h3>
                <BandPill band={c.band} />
              </div>
              {c.feedback && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {c.feedback}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      {result.summary && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-1.5 text-sm font-bold text-foreground">Examiner Summary</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{result.summary}</p>
        </div>
      )}

      {/* Improvements */}
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

      {/* Corrected examples */}
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

const WritingQuestion = ({ id: docId, passage, description }) => {
  const promptHtml = passage?.writing?.promptHtml || passage?.bodyHtml || '';
  const title = passage?.title || '';
  const task = passage?.writing?.task === 1 ? 1 : 2;
  const minWords = passage?.writing?.wordLimitMin || (task === 1 ? 150 : 250);
  const storageKey = passage?.slug || docId;

  const [userResponse, setUserResponse] = useState('');
  const [result, setResult] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Restore any local draft for this prompt (foundation for the accounts wave).
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(`ielts-writing-draft:${storageKey}`);
      if (saved) setUserResponse(saved);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const handleResponseChange = useCallback(
    (e) => {
      const val = e.target.value;
      setUserResponse(val);
      if (storageKey && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(`ielts-writing-draft:${storageKey}`, val);
        } catch {
          /* ignore */
        }
      }
    },
    [storageKey]
  );

  const wordCount = userResponse.split(/\s+/).filter(Boolean).length;
  const progressValue = Math.min((wordCount / minWords) * 100, 100);
  const isSufficient = wordCount >= minWords;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', 'submit_writing', {
        category: 'User Engagement',
        label: 'Writing Test Submission',
      });
    }

    if (!isSufficient) {
      setErrorMsg(
        `Your answer must be at least ${minWords} words. Current word count: ${wordCount}.`
      );
      return;
    }

    setIsLoading(true);
    try {
      // Attach the current session's access token (if signed in) so the scorer
      // can persist the result server-side. Fail-soft: any error here just means
      // we POST without auth and score normally.
      const headers = { 'Content-Type': 'application/json' };
      try {
        const { data } = await getSupabase().auth.getSession();
        const accessToken = data?.session?.access_token;
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      } catch {
        /* not signed in / auth unavailable — score anonymously */
      }

      const response = await fetch(SCORE_API, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: htmlToText(promptHtml),
          essay: userResponse,
          task,
          passage_id: passage?.id || null,
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
        setFeedbackOpen(true);
        confetti({ spread: 100, particleCount: 200, origin: { y: 0.5 }, zIndex: 3000, scalar: 1.4 });
      } else if (response.status === 429) {
        setErrorMsg(
          (data && data.error) ||
            'You have reached the scoring limit. Please try again later.'
        );
      } else {
        setErrorMsg(
          (data && data.error) || 'Failed to score your answer. Please try again.'
        );
      }
    } catch {
      setErrorMsg('A network error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const pageTitle = title
    ? `${title} | IELTS Writing Practice | IELTS-Bank`
    : 'IELTS Writing Practice | IELTS-Bank';
  const metaDescription =
    description ||
    `AI-powered IELTS grading for your writing. Practise with a real IELTS question like: '${title}'.`;
  const canonicalUrl = `${SITE_URL}/writingquestion/${encodeURIComponent(docId || '')}`;
  const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(
    title || 'IELTS Writing Practice'
  )}&type=writing&subtitle=${encodeURIComponent(`Task ${task}`)}`;

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

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={`IELTS Writing Task ${task} practice: ${title}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={ogImage} />
      </Head>

      <div className="tw-root min-h-screen bg-background">
        <Navbar />

        <main className="mx-auto max-w-7xl px-4 py-6 pb-16 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              IELTS Writing Practice — AI-Powered Feedback
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Prompt */}
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-foreground">
                Writing Prompt
              </h2>
              <div className={PROMPT_HTML_CLASS} dangerouslySetInnerHTML={{ __html: promptHtml }} />
            </div>

            {/* Answer */}
            <div className="flex flex-col rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="mb-2 flex items-end justify-between gap-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
                  Your Answer
                </h2>
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
                value={userResponse}
                onChange={handleResponseChange}
                placeholder="Write your full response here…"
                className="min-h-[320px] resize-y"
              />
              {errorMsg && (
                <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorMsg}
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 flex justify-center">
            <Button variant="accent" size="lg" onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? 'Analyzing…' : 'Get AI Feedback'}
            </Button>
          </div>
        </main>
      </div>

      {/* Feedback modal — structured, plain-text render (no HTML injection) */}
      <Modal
        open={feedbackOpen && !!result}
        onClose={() => setFeedbackOpen(false)}
        title="Your AI Feedback & Score"
      >
        {result && <ScoreReport task={task} result={result} />}
        <div className="mt-5 flex justify-end">
          <Button onClick={() => setFeedbackOpen(false)}>Close</Button>
        </div>
      </Modal>

      {/* Loading modal */}
      <Modal open={isLoading} onClose={() => {}} title="Analyzing your response" dismissible={false}>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-secondary border-t-accent" />
          <p className="text-sm text-muted-foreground">
            Scoring against the official IELTS rubric.
            <br />
            This can take up to 60 seconds.
          </p>
        </div>
      </Modal>
    </>
  );
};

export default WritingQuestion;

import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Navbar from '../components/Navbar';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Progress } from '../../components/ui/progress';
import { cn } from '../lib/utils';
import { getSupabase } from '../../lib/supabase';
import { sanitizeHtml } from '../../lib/sanitize';
import RelatedPractice from '../components/RelatedPractice';
import Modal from '../components/AccessibleModal';
import { getAnonId, track } from '../lib/analytics';
import { useAuth } from '../lib/auth';
import AiQuotaPanel from '../components/AiQuotaPanel';
import SignInDialog from '../components/auth/SignInDialog';
import { ScoringProgress, CriterionFeedback } from '../components/question/ScoreUI';

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
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-foreground">{label}</h3>
                <BandPill band={c.band} />
              </div>
              <CriterionFeedback criterion={c} />
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

const WritingQuestion = ({ id: docId, passage, description, related = [] }) => {
  const { user } = useAuth();
  const promptHtml = passage?.writing?.promptHtml || passage?.bodyHtml || '';
  const title = passage?.title || '';
  const task = passage?.writing?.task === 1 ? 1 : 2;
  const minWords = passage?.writing?.wordLimitMin || (task === 1 ? 150 : 250);
  const modelAnswerHtml = passage?.writing?.modelAnswerHtml || '';
  const modelAnswerRationaleHtml = passage?.writing?.modelAnswerRationaleHtml || '';
  const storageKey = passage?.slug || docId;

  const [userResponse, setUserResponse] = useState('');
  const [result, setResult] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);

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

    if (!isSufficient) {
      setErrorMsg(
        `Your answer must be at least ${minWords} words. Current word count: ${wordCount}.`
      );
      return;
    }

    if (!user) {
      setSignInOpen(true);
      return;
    }

    track('writing_submit', { skill: 'writing', slug: storageKey, task, word_count: wordCount, signed_in: true });

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
        track('ai_score_result', { skill: 'writing', slug: storageKey, outcome: 'ok', band: data.overallBand, task, word_count: wordCount, signed_in: true });
        setFeedbackOpen(true);
        import('canvas-confetti').then(({ default: confetti }) => confetti({ spread: 100, particleCount: 200, origin: { y: 0.5 }, zIndex: 3000, scalar: 1.4 })).catch(() => {});
      } else if (response.status === 401) {
        setSignInOpen(true);
        setErrorMsg('Your session expired. Sign in again to score this response.');
      } else if (response.status === 402 || response.status === 429) {
        setQuotaOpen(true);
        track('ai_score_result', { skill: 'writing', slug: storageKey, outcome: 'rate_limited', task, signed_in: true });
        setErrorMsg(
          (data && data.error) ||
            'You have reached the scoring limit. Please try again later.'
        );
      } else {
        track('ai_score_result', { skill: 'writing', slug: storageKey, outcome: 'error', http_status: response.status, task, signed_in: true });
        setErrorMsg(
          (data && data.error) || 'Failed to score your answer. Please try again.'
        );
      }
    } catch {
      track('ai_score_result', { skill: 'writing', slug: storageKey, outcome: 'error', error_type: 'network', task, signed_in: true });
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
      <div className="min-h-screen bg-background">
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

      <div className="min-h-screen bg-background">
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
              <div className={PROMPT_HTML_CLASS} dangerouslySetInnerHTML={{ __html: sanitizeHtml(promptHtml) }} />
              {modelAnswerHtml ? (
                <details className="mt-6 rounded-lg border border-accent/30 bg-accent/5">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Show Band 8–9 model answer
                  </summary>
                  <div className="border-t border-accent/20 px-4 py-4">
                    <div className="space-y-3 text-sm leading-7 text-foreground" dangerouslySetInnerHTML={{ __html: sanitizeHtml(modelAnswerHtml) }} />
                    {modelAnswerRationaleHtml ? (
                      <div className="mt-5 rounded-md border border-border bg-background p-4">
                        <h3 className="mb-2 text-sm font-bold text-foreground">Why this response works</h3>
                        <div className="text-sm leading-6 text-muted-foreground" dangerouslySetInnerHTML={{ __html: sanitizeHtml(modelAnswerRationaleHtml) }} />
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : null}
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
                aria-label="Your writing response"
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
          <div className="mt-2"><AiQuotaPanel userId={user?.id} remaining={result?.quotaRemaining} open={quotaOpen} onClose={() => setQuotaOpen(false)} /></div>
          <RelatedPractice skill="writing" items={related} className="mt-10" />
        </main>
      </div>

      {/* Feedback modal — structured, plain-text render (no HTML injection) */}
      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} title="Sign in to get AI feedback" description="Your draft stays right here — sign up in seconds and get your band score." trigger="writing_task_score" />
      <Modal
        open={feedbackOpen && !!result}
        onClose={() => setFeedbackOpen(false)}
        title="Your AI Feedback & Score"
      >
        {result && <ScoreReport task={task} result={result} />}
        {result ? <p className="mt-4 rounded-md bg-accent/5 p-3 text-sm text-foreground">You have {result.quotaRemaining ?? 'a limited number of'} free AI scores remaining. Revise this draft using the feedback, then score it again.</p> : null}
        <div className="mt-5 flex justify-end">
          <Button onClick={() => setFeedbackOpen(false)}>Close</Button>
        </div>
      </Modal>

      {/* Loading modal */}
      <Modal open={isLoading} onClose={() => {}} title="Analyzing your response" dismissible={false}>
        <ScoringProgress />
      </Modal>
    </>
  );
};

export default WritingQuestion;

import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import confetti from 'canvas-confetti';
import Navbar from '../components/Navbar';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Progress } from '../../components/ui/progress';
import { cn } from '../lib/utils';

const SITE_URL = 'https://ielts-bank.com';
const SCORE_ENDPOINT = 'https://wamm2ytjk5.execute-api.us-east-1.amazonaws.com/IELTSWritingBot';
const PROMPT_HTML_CLASS =
  'text-[15px] leading-7 text-foreground [&_p]:mb-4 [&_strong]:font-semibold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_li]:mb-1';

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

const WritingQuestion = ({ id: docId, passage, description }) => {
  const promptHtml = passage?.writing?.promptHtml || passage?.bodyHtml || '';
  const title = passage?.title || '';
  const minWords = passage?.writing?.wordLimitMin || 250;
  const storageKey = passage?.slug || docId;

  const [userResponse, setUserResponse] = useState('');
  const [apiResponse, setApiResponse] = useState('');
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
      const response = await fetch(SCORE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: promptHtml, answer: userResponse }),
      });
      if (response.ok) {
        const data = await response.json();
        setApiResponse(data.message || '');
        setFeedbackOpen(true);
        confetti({ spread: 100, particleCount: 200, origin: { y: 0.5 }, zIndex: 3000, scalar: 1.4 });
      } else {
        setErrorMsg('Failed to score the answer. Please try again.');
      }
    } catch {
      setErrorMsg('An error occurred. Please try again.');
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
        <meta property="og:image" content={`${SITE_URL}/logo512.png`} />
        <meta name="twitter:card" content="summary" />
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

      {/* Feedback modal */}
      <Modal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} title="Your AI Feedback & Score">
        <div
          className="text-sm leading-relaxed text-foreground [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:font-bold [&_p]:mb-3 [&_strong]:font-semibold"
          dangerouslySetInnerHTML={{ __html: apiResponse }}
        />
        <div className="mt-4 flex justify-end">
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

// src/components/writingChecker/WritingCheckerTool.jsx
// The interactive AI Writing Checker (form, scoring flow, report, sign-in
// gate, sticky mobile CTA), shared by /ielts-writing-checker and the
// task-specific landing pages under /ielts-writing-checker/<task>.
//
// `lockedTaskType` pins the task (Task 2 essay / Academic Task 1 / GT letter)
// on a task page: the select is replaced by a fixed label and the scoring
// request always carries that task. Without it the learner picks the task.
//
// All pages share ONE localStorage draft, so a draft survives the sign-in and
// billing round-trips (the Premium return path is always /ielts-writing-checker,
// which restores the draft with its task type). A locked page only restores a
// stored draft of its own task and never overwrites a draft of another task
// until the learner types on it.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import { buildUpgradeHref } from '../../../lib/upgradeContext';
import { WRITING_PROMPT_MAX_CHARS } from '../../../lib/writingLimits';
import SignInDialog from '../auth/SignInDialog';
import { useAuth } from '../../lib/auth';
import { saveAttemptToSupabase } from '../../lib/progress';
import { getSupabase } from '../../../lib/supabase';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import { Select } from '../../../components/ui/select';
import { Label } from '../../../components/ui/label';
import { Progress } from '../../../components/ui/progress';
import { cn } from '../../lib/utils';
import { getAnonId, track } from '../../lib/analytics';
import AiQuotaPanel from '../AiQuotaPanel';
import FreeSampleChip from '../question/FreeSampleChip';
import { ScoringProgress } from '../question/ScoreUI';
import WritingScoreReport from '../question/WritingScoreReport';
import StickyMobileCta from '../StickyMobileCta';
import { getSessionAccess } from '../../lib/sessionAccess';
import { consumeWritingDraft } from '../../lib/writingDraft';

const SCORE_API = '/api/score/writing';
export const WRITING_CHECKER_DRAFT_KEY = 'ielts-writing-checker-draft';
// Analytics identifier for this tool (there is no passage row behind it).
const CHECKER_SLUG = 'writing-checker';
// Premium return path. upgradeContext only accepts the main checker, and the
// shared draft (with its task type) is restored there.
const RETURN_TO = '/ielts-writing-checker';

// Task-type options. The scoring API only distinguishes Task 1 vs Task 2, so
// both Task 1 variants map to apiTask=1; the label is passed to the model as
// part of the prompt text so it can apply the right expectations.
export const TASK_TYPES = [
  { value: 'task1-academic', label: 'Task 1 — Academic', apiTask: 1, minWords: 150 },
  { value: 'task1-general', label: 'Task 1 — General Training', apiTask: 1, minWords: 150 },
  { value: 'task2', label: 'Task 2 — Essay', apiTask: 2, minWords: 250 },
];
const TASK_VALUES = new Set(TASK_TYPES.map((t) => t.value));

export default function WritingCheckerTool({
  lockedTaskType = null,
  // Analytics label for the page hosting the tool ('main', 'task-2', …).
  variant = 'main',
  essayLabel = 'Your essay',
  essayPlaceholder = 'Paste or write your full response here…',
  promptPlaceholder = 'Paste the exact task question here for more accurate feedback…',
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const locked = lockedTaskType && TASK_VALUES.has(lockedTaskType) ? lockedTaskType : null;

  const [taskType, setTaskType] = useState(locked || 'task2');
  const [prompt, setPrompt] = useState('');
  const [essay, setEssay] = useState('');
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [signInOpen, setSignInOpen] = useState(false);
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [quotaResetsAt, setQuotaResetsAt] = useState(null);
  // True once the user has pressed submit while signed-out — after they sign in
  // the submission resumes automatically (score if premium, billing if not).
  const pendingSubmitRef = useRef(false);
  // Last essay text already captured to the account — prevents duplicate
  // attempt rows when the gate fires repeatedly for the same draft.
  const capturedEssayRef = useRef('');
  // Set when the homepage hero handed off an essay: once auth has resolved we
  // run the normal submit path for the user without a second click.
  const [autoRun, setAutoRun] = useState(false);
  // Draft restore runs exactly once and gates the persist effect below.
  const [restored, setRestored] = useState(false);
  // Persisting starts once there is something of this page's to keep (a
  // restored draft, a handoff, or the learner's own edit), so opening a task
  // page never wipes a stored draft of a different task.
  const [dirty, setDirty] = useState(false);
  const restoredRef = useRef(false);
  const autoRunDoneRef = useRef(false);
  const formRef = useRef(null);
  const toolRef = useRef(null);

  const active = TASK_TYPES.find((t) => t.value === taskType) || TASK_TYPES[2];
  const apiTask = active.apiTask;
  const minWords = active.minWords;

  const wordCount = essay.split(/\s+/).filter(Boolean).length;
  const progressValue = Math.min((wordCount / minWords) * 100, 100);
  const isSufficient = wordCount >= minWords;

  // Restore a draft on mount. Two sources, in priority order:
  //   1. A one-shot handoff (sessionStorage) from the homepage hero paste box
  //      or the essay bank's "use it in the checker" link. It wins over the
  //      stored draft; an essay handoff arms an automatic submit so the user
  //      continues straight into the existing flow.
  //   2. The shared checker draft (localStorage), which carries a signed-out
  //      user's work across the sign-in round-trip.
  useEffect(() => {
    if (typeof window === 'undefined' || restoredRef.current) return;
    // React StrictMode double-invokes mount effects in development. Without
    // this guard the second pass finds the handoff already consumed, falls
    // through to the localStorage branch, and restores the EMPTY draft the
    // persist effect wrote from initial state — silently wiping the essay the
    // hero just handed over.
    restoredRef.current = true;
    const handoff = consumeWritingDraft();
    if (handoff && (!locked || handoff.taskType === locked)) {
      setTaskType(locked || handoff.taskType);
      setPrompt(handoff.prompt);
      // A prompt-only handoff (the essay bank's "answer this question in the
      // checker" link) arrives with an empty essay and autoSubmit=false, so the
      // learner lands on a blank answer box under the pre-filled question.
      setEssay(handoff.essay);
      if (handoff.autoSubmit) setAutoRun(true);
      setDirty(true);
      setRestored(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(WRITING_CHECKER_DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && typeof saved === 'object') {
        const savedType = typeof saved.taskType === 'string' ? saved.taskType : null;
        if (locked && savedType !== locked) return;
        if (!locked && savedType) setTaskType(savedType);
        if (typeof saved.prompt === 'string') setPrompt(saved.prompt);
        if (typeof saved.essay === 'string') setEssay(saved.essay);
        setDirty(true);
      }
    } catch {
      /* ignore malformed draft */
    } finally {
      setRestored(true);
    }
  }, [locked]);

  // A "must be at least N words" error is stale the moment the essay reaches
  // the minimum — clear it instead of leaving red text above a valid form.
  useEffect(() => {
    if (isSufficient && errorMsg.startsWith('Your answer must be at least')) setErrorMsg('');
  }, [errorMsg, isSufficient]);

  // Persist the draft on every change so nothing is lost on navigation/auth.
  // Gated on `restored` so the first render's empty state never overwrites a
  // stored draft before the restore above has had a chance to load it.
  useEffect(() => {
    if (typeof window === 'undefined' || !restored || !dirty) return;
    try {
      window.localStorage.setItem(
        WRITING_CHECKER_DRAFT_KEY,
        JSON.stringify({ taskType, prompt, essay })
      );
    } catch {
      /* storage full / unavailable — non-fatal */
    }
  }, [restored, dirty, taskType, prompt, essay]);

  // Premium gate: capture the essay to the signed-in user's account (attempt
  // row without a band — the checker has no passage row, so passage_id stays
  // null), then send them to billing. The draft also persists in localStorage
  // on every change, so the form is intact when they come back.
  const goToPremium = useCallback(async () => {
    if (user?.id && essay.trim() && capturedEssayRef.current !== essay) {
      const res = await saveAttemptToSupabase({
        userId: user.id,
        passageId: null,
        skill: 'writing',
        responses: { essay, prompt: prompt.trim(), task: apiTask },
        band: null,
      });
      if (res.ok) capturedEssayRef.current = essay;
    }
    track('paywall_redirect', { skill: 'writing', slug: CHECKER_SLUG, source: 'writing_checker_submit', checker_page: variant });
    router.push(buildUpgradeHref({ upgrade: 'writing', stage: 'saved', return_to: RETURN_TO }));
  }, [apiTask, essay, prompt, router, user?.id, variant]);

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
    track('writing_submit', { skill: 'writing', slug: 'writing-checker', task: apiTask, word_count: wordCount, signed_in: Boolean(user), checker_page: variant });
    let scored = false;
    try {
      const headers = { 'Content-Type': 'application/json' };
      const session = await getSessionAccess(getSupabase);
      if (session.error) {
        track('ai_score_result', {
          skill: 'writing',
          slug: CHECKER_SLUG,
          outcome: 'error',
          error_type: 'auth_session',
          task: apiTask,
          signed_in: Boolean(user),
        });
        setErrorMsg('Could not verify your session. Please refresh and try again.');
        return;
      }
      if (session.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;

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
        // Result renders after the ScoringProgress run-through completes
        // (results show when result && !isLoading; onFinished flips loading).
        scored = true;
        setResult(data);
        track('ai_score_result', { skill: 'writing', slug: 'writing-checker', outcome: 'ok', band: data.overallBand, task: apiTask, word_count: wordCount, free: data.free === true, signed_in: Boolean(user), checker_page: variant });
      } else if (response.status === 401) {
        // No session (or it expired): sign in and the submission resumes when
        // the dialog closes.
        pendingSubmitRef.current = true;
        setSignInOpen(true);
        setErrorMsg((data && data.error) || 'Please sign in to score this essay.');
      } else if (response.status === 402 && data?.reason === 'premium_required') {
        // Server-side premium gate (covers a stale client plan): capture the
        // essay to the account and send them to billing.
        track('ai_score_result', { skill: 'writing', slug: 'writing-checker', outcome: 'premium_gate', task: apiTask, signed_in: Boolean(user) });
        await goToPremium();
      } else if (response.status === 402 || response.status === 429) {
        setQuotaResetsAt(data?.resetsAt || null);
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
      if (!scored) setIsLoading(false);
    }
  }, [active.label, apiTask, essay, goToPremium, isSufficient, minWords, prompt, user, variant, wordCount]);

  // The route owns the entitlement decision because a non-premium account may
  // still have its one lifetime sample available.
  const continueSubmit = useCallback(() => {
    runScore();
  }, [runScore]);

  // Shared by the form's own submit button and by the homepage-hero handoff.
  const startSubmit = useCallback(() => {
    setErrorMsg('');

    if (!isSufficient) {
      setErrorMsg(
        `Your answer must be at least ${minWords} words to be scored. Current word count: ${wordCount}.`
      );
      return;
    }

    // Premium-only scoring: signed-out visitors sign up first (the draft is
    // persisted by the effect above, so nothing is lost); the submission
    // resumes when the dialog closes and routes to billing if needed.
    if (!loading && !user) {
      pendingSubmitRef.current = true;
      setSignInOpen(true);
      track('premium_gate', { skill: 'writing', slug: CHECKER_SLUG, stage: 'signup', checker_page: variant });
      return;
    }

    continueSubmit();
  }, [continueSubmit, isSufficient, loading, minWords, user, variant, wordCount]);

  const handleSubmit = (e) => {
    e.preventDefault();
    startSubmit();
  };

  // Continue the homepage hero's submission once auth has resolved. Runs once:
  // a refresh of this page will not silently re-score (the handoff record was
  // consumed on read, and the ref guards a same-mount re-entry).
  useEffect(() => {
    if (!autoRun || loading || autoRunDoneRef.current) return;
    autoRunDoneRef.current = true;
    setAutoRun(false);
    if (typeof formRef.current?.scrollIntoView === 'function') {
      formRef.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    startSubmit();
  }, [autoRun, loading, startSubmit]);

  return (
    <>
      <section id="check" className="mx-auto w-full max-w-3xl scroll-mt-20 px-4 py-10 sm:px-6 lg:px-8">
        <div ref={toolRef} className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
            {locked ? (
              <p className="text-sm text-muted-foreground">
                Task type: <span className="font-semibold text-foreground">{active.label}</span>
              </p>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="task-type">Task type</Label>
                <Select
                  id="task-type"
                  value={taskType}
                  onChange={(e) => {
                    setTaskType(e.target.value);
                    setDirty(true);
                  }}
                >
                  {TASK_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="prompt">
                Question / prompt{' '}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setDirty(true);
                }}
                maxLength={WRITING_PROMPT_MAX_CHARS}
                placeholder={promptPlaceholder}
                className="min-h-[80px] resize-y"
              />
            </div>

            <div className="grid gap-1.5">
              <div className="flex items-end justify-between gap-4">
                <Label htmlFor="essay">{essayLabel}</Label>
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
                onChange={(e) => {
                  setEssay(e.target.value);
                  setDirty(true);
                }}
                placeholder={essayPlaceholder}
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
                ? 'Get my free band score'
                : 'Check my writing'}
            </Button>
            <AiQuotaPanel userId={user?.id} remaining={result?.quotaRemaining} open={quotaOpen} onClose={() => setQuotaOpen(false)} skill="writing" resetsAt={quotaResetsAt} />
            {!loading && !user ? (
              <p className="text-center text-xs text-muted-foreground">
                Next you create a free account (email and password, no card). Your draft
                stays saved while you sign up.
              </p>
            ) : (
              !result && <FreeSampleChip />
            )}
          </form>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="mt-6 rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <h2 className="mb-2 text-lg font-bold tracking-tight text-foreground">
              Analyzing your response
            </h2>
            <ScoringProgress done={Boolean(result)} onFinished={() => setIsLoading(false)} />
          </div>
        )}

        {/* Result */}
        {result && !isLoading && (
          <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-7">
            <h2 className="mb-4 text-lg font-bold tracking-tight text-foreground">
              Your estimated score &amp; feedback
            </h2>
            <WritingScoreReport task={apiTask} result={result} />
            {result.free === true ? (
              // The free sample is spent: the Exam Pass offer inside the
              // report is the one primary action. A second accent button
              // ("Score another draft") only led to the paywall anyway.
              <p className="mt-5 text-center text-sm text-muted-foreground">
                Not ready to upgrade?{' '}
                <NextLink href="/writingquestion" className="font-semibold text-accent">
                  Keep practising with Writing tasks and model answers
                </NextLink>
                .
              </p>
            ) : (
              <div className="mt-5 rounded-lg border border-accent/30 bg-accent/5 p-4">
                <p className="text-sm font-semibold text-foreground">Put the feedback into practice</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Button
                    variant="accent"
                    onClick={() => {
                      setResult(null);
                      toolRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    Score another draft{result.quotaRemaining != null ? ` (${result.quotaRemaining} left)` : ''}
                  </Button>
                  <Button asChild variant="outline"><NextLink href="/writingquestion">Choose a Writing task</NextLink></Button>
                </div>
              </div>
            )}
            <p className="mt-4 rounded-md bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
              This is an AI estimate for study purposes, not an official IELTS result.
            </p>
          </div>
        )}
      </section>

      <StickyMobileCta
        watchRef={toolRef}
        hidden={isLoading || Boolean(result) || signInOpen}
        label={essay.trim() ? 'Back to my essay' : 'Check my essay free'}
        hint={!loading && !user ? 'First report free · no card' : undefined}
        source={CHECKER_SLUG}
        onActivate={() => {
          toolRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
          window.setTimeout(() => document.getElementById('essay')?.focus({ preventScroll: true }), 400);
        }}
      />
      <SignInDialog
        open={signInOpen}
        onOpenChange={(v) => {
          setSignInOpen(v);
          if (!v) {
            const shouldRun = pendingSubmitRef.current && Boolean(user);
            pendingSubmitRef.current = false;
            if (shouldRun) continueSubmit();
          }
        }}
        redirectOnFinish={false}
        title="Sign up to get your essay scored"
        description="Create a free account to get your first AI score. Your draft is saved, so nothing you’ve written is lost."
        trigger="writing_checker_score"
      />
    </>
  );
}

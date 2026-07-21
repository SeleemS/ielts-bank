import React from 'react';
import { PenLine, ArrowRight, Loader2, Lock } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { cn } from '../../lib/utils';
import { getAnonId } from '../../lib/analytics';

// The Band Estimator's MEASURED Writing section: a short (~100 word) sample,
// marked server-side by /api/estimator/score-writing.
//
// The band deliberately never reaches this component — the API returns only
// { scored: true } and the band is revealed after sign-up. We say so plainly
// BEFORE the visitor writes: springing the gate afterwards would be a dark
// pattern, and anyone who objects can rate themselves instead (onSelfAssess).
export default function WritingSampleStep({
  task,
  value,
  onChange,
  progress,
  onScored,
  onSelfAssess,
  onError,
}) {
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  const words = String(value || '').trim().split(/\s+/).filter(Boolean).length;
  const tooShort = words < task.minWords;
  const tooLong = words > task.maxWords;
  const canSubmit = !tooShort && !tooLong && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/estimator/score-writing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anon_id: getAnonId(), essay: value }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = body.error || 'We could not mark your writing just now.';
        setError(message);
        onError?.(body.code || String(response.status));
        return;
      }
      onScored?.({ wordCount: body.wordCount ?? words });
    } catch {
      setError('We could not reach the marking service. Check your connection and try again.');
      onError?.('network');
    } finally {
      setSubmitting(false);
    }
  };

  const counterTone = tooLong
    ? 'text-destructive'
    : words >= task.minWords
      ? 'text-accent'
      : 'text-muted-foreground';

  return (
    <div
      className="mx-auto w-full max-w-2xl"
      data-analytics-surface="band_estimator"
      data-analytics-skill="writing"
      data-analytics-slug="band-estimator"
    >
      <div className="mb-5 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent">
          <PenLine className="h-4.5 w-4.5" />
        </span>
        <div>
          {progress ? (
            <div className="text-xs font-semibold uppercase tracking-wide text-accent">
              {progress.label}
            </div>
          ) : null}
          <h2 className="text-lg font-bold tracking-tight text-foreground">Writing sample</h2>
        </div>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        Unlike a self-rating, this is actually marked. Write a short answer and an AI examiner will
        assess it against the official band descriptors.
      </p>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Your task
        </div>
        <p className="mt-1.5 text-base font-semibold leading-relaxed text-foreground">
          {task.prompt}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{task.guidance}</p>
      </div>

      <div className="mt-4">
        <label htmlFor="estimator-writing-sample" className="sr-only">
          Your written response
        </label>
        <textarea
          id="estimator-writing-sample"
          value={value || ''}
          onChange={(event) => onChange(event.target.value)}
          rows={9}
          placeholder="Write your answer here…"
          className="w-full rounded-lg border border-input bg-background p-3 text-base leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
        />
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span className={cn('font-medium tabular-nums', counterTone)}>
            {words} / {task.targetWords} words
          </span>
          <span className="text-muted-foreground">
            {tooLong
              ? `Keep it under ${task.maxWords} words`
              : tooShort
                ? `At least ${task.minWords} words to mark`
                : 'Ready to mark'}
          </span>
        </div>
      </div>

      {/* Say the gate out loud, before they invest the effort. */}
      <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-border bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Your Writing band and overall estimate unlock when you save your results with a free
          account — no payment, and your Reading and Listening bands are shown either way.
        </span>
      </div>

      {error ? (
        <div role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="mt-6 flex flex-col items-center gap-3">
        <Button
          variant="accent"
          size="lg"
          onClick={submit}
          disabled={!canSubmit}
          className="w-full max-w-sm"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Marking your writing…
            </>
          ) : (
            <>
              Mark my writing <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
        <button
          type="button"
          onClick={onSelfAssess}
          disabled={submitting}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          Skip — I&apos;d rather rate my own writing
        </button>
      </div>
    </div>
  );
}

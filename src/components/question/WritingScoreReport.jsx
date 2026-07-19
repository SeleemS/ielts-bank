import * as React from 'react';
import NextLink from 'next/link';
import { Lock, Sparkles } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { cn } from '../../lib/utils';
import { track } from '../../lib/analytics';
import { BandHero, BandMeter, CriterionFeedback } from './ScoreUI';

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

function BandPill({ band }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-[2.75rem] items-center justify-center rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums',
        bandTone(band)
      )}
    >
      {formatBand(band)}
    </span>
  );
}

function LockedSection({ children, locked }) {
  return (
    <div className={cn('relative', locked && 'select-none overflow-hidden')} aria-hidden={locked || undefined}>
      <div className={cn(locked && 'pointer-events-none blur-[5px] opacity-55')}>{children}</div>
    </div>
  );
}

function issueCount(result) {
  const criterionIssues = Object.values(result.criteria || {}).reduce(
    (count, criterion) =>
      count + (Array.isArray(criterion?.improvements) ? criterion.improvements.length : 0),
    0
  );
  return (
    criterionIssues +
    (Array.isArray(result.improvements) ? result.improvements.length : 0) +
    (Array.isArray(result.correctedExamples) ? result.correctedExamples.length : 0)
  );
}

export default function WritingScoreReport({ task, result, sample = false }) {
  const criteriaMeta = task === 1 ? TASK1_CRITERIA : TASK2_CRITERIA;
  const criteria = result.criteria || {};
  const improvements = Array.isArray(result.improvements) ? result.improvements : [];
  const corrected = Array.isArray(result.correctedExamples)
    ? result.correctedExamples
    : [];
  const isTeaser = result.free === true && !sample;
  const trackedRef = React.useRef(false);

  React.useEffect(() => {
    if (!isTeaser || trackedRef.current) return;
    trackedRef.current = true;
    track('premium_gate', {
      source: 'score_tease',
      stage: 'impression',
      skill: 'writing',
      band: result.overallBand,
    });
  }, [isTeaser, result.overallBand]);

  return (
    <div className="space-y-5">
      <BandHero
        band={result.overallBand}
        subtitle={`Writing Task ${task}${result.wordCount ? ` · ${result.wordCount} words` : ''}`}
      />

      <div className="space-y-3">
        {criteriaMeta.map(([key, label], index) => {
          const criterion = criteria[key] || {};
          const locked = isTeaser && index > 0;
          return (
            <LockedSection key={key} locked={locked}>
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-foreground">{label}</h3>
                  <BandPill band={criterion.band} />
                </div>
                <div className="mb-3">
                  <BandMeter band={criterion.band} />
                </div>
                <CriterionFeedback criterion={criterion} />
              </div>
            </LockedSection>
          );
        })}
      </div>

      {result.summary && (
        <LockedSection locked={isTeaser}>
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-1.5 text-sm font-bold text-foreground">Examiner Summary</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{result.summary}</p>
          </div>
        </LockedSection>
      )}

      {improvements.length > 0 && (
        <LockedSection locked={isTeaser}>
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-2 text-sm font-bold text-foreground">How to Improve</h3>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
              {improvements.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        </LockedSection>
      )}

      {corrected.length > 0 && (
        <LockedSection locked={isTeaser}>
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-2 text-sm font-bold text-foreground">Corrected Examples</h3>
            <div className="space-y-3">
              {corrected.map((example, index) => (
                <div key={index} className="rounded-md border border-border/70 bg-secondary/30 p-3">
                  <p className="text-sm text-destructive line-through decoration-destructive/50">
                    {example.original}
                  </p>
                  <p className="mt-1 text-sm font-medium text-accent">{example.suggestion}</p>
                </div>
              ))}
            </div>
          </div>
        </LockedSection>
      )}

      {isTeaser ? (
        <div className="sticky bottom-3 z-10 rounded-xl border border-primary/25 bg-background/95 p-5 text-center shadow-xl backdrop-blur">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="h-5 w-5" />
          </span>
          <h3 className="mt-3 text-base font-bold text-foreground">
            Your Band {formatBand(result.overallBand)} essay has {issueCount(result)} fixable issues
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            You&apos;ve seen your overall band and first criterion. Unlock the other three criteria,
            examiner summary, improvement plan, and corrected examples.
          </p>
          <Button asChild variant="accent" className="mt-4">
            <NextLink
              href="/pricing?upgrade=writing"
              onClick={() =>
                track('paywall_upgrade_click', {
                  source: 'score_tease',
                  skill: 'writing',
                  band: result.overallBand,
                })
              }
              className="no-underline"
            >
              <Sparkles className="h-4 w-4" />
              Unlock full feedback — Premium
            </NextLink>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

import * as React from 'react';
import {
  FileText,
  ListChecks,
  AlignLeft,
  BookOpen,
  PenLine,
  Gauge,
  Check,
  CheckCircle2,
  Lightbulb,
} from 'lucide-react';
import { cn } from '../../lib/utils';

// Shared UI for the AI writing-score flow:
//   <ScoringProgress />    — staged, animated progress shown while the API call
//                            runs (replaces the bare spinner).
//   <CriterionFeedback />  — renders a criterion's structured strengths /
//                            improvements bullets, falling back to the legacy
//                            `feedback` paragraph for scores saved before the
//                            schema change.

const STAGES = [
  { icon: FileText, label: 'Reading your response' },
  { icon: ListChecks, label: 'Judging task response' },
  { icon: AlignLeft, label: 'Checking coherence & cohesion' },
  { icon: BookOpen, label: 'Weighing vocabulary range' },
  { icon: PenLine, label: 'Reviewing grammar & accuracy' },
  { icon: Gauge, label: 'Calculating your band score' },
];
// Seconds at which each stage becomes active. The API typically answers in
// 10-45s; the last stage simply holds until the result arrives.
const STAGE_AT = [0, 6, 13, 20, 27, 35];

const TIPS = [
  'Examiners reward a clear position held from the first paragraph to the last.',
  'One well-developed example beats three unexplained ones.',
  'Linking words help — but only when each one earns its place.',
  'Less common vocabulary lifts your Lexical Resource band, if used precisely.',
  'A mix of simple and complex sentences reads better than all-complex.',
  'The overall band is the average of the four criteria, rounded to 0.5.',
];

export function ScoringProgress() {
  const [elapsed, setElapsed] = React.useState(0);
  const [tipIndex, setTipIndex] = React.useState(0);

  React.useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setElapsed((Date.now() - started) / 1000), 250);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    const t = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 6000);
    return () => clearInterval(t);
  }, []);

  // Asymptotic progress: quick early movement, never quite reaches the end
  // until the real result closes the modal.
  const progress = Math.min(96, Math.round(100 * (1 - Math.exp(-elapsed / 22))));
  const activeStage = STAGE_AT.reduce((acc, at, i) => (elapsed >= at ? i : acc), 0);

  return (
    <div className="py-2">
      {/* Progress bar */}
      <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>Marking against the official IELTS rubric</span>
        <span className="tabular-nums">{progress}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Stage checklist */}
      <ul className="mt-5 space-y-2.5">
        {STAGES.map(({ icon: Icon, label }, i) => {
          const done = i < activeStage;
          const active = i === activeStage;
          return (
            <li
              key={label}
              className={cn(
                'flex items-center gap-3 text-sm transition-colors duration-300',
                done ? 'text-foreground' : active ? 'font-medium text-foreground' : 'text-muted-foreground/60'
              )}
            >
              <span
                className={cn(
                  'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors duration-300',
                  done
                    ? 'border-accent bg-accent text-accent-foreground'
                    : active
                      ? 'border-accent/60 bg-accent/10 text-accent'
                      : 'border-border bg-secondary/50 text-muted-foreground/50'
                )}
              >
                {done ? (
                  <Check className="h-4 w-4 animate-in zoom-in duration-300" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
                {active && (
                  <span className="absolute inset-0 animate-ping rounded-full border border-accent/50" />
                )}
              </span>
              {label}
              {active && (
                <span className="ml-auto flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:300ms]" />
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {/* Rotating tip */}
      <div className="mt-5 rounded-md bg-accent/5 px-3.5 py-3">
        <p key={tipIndex} className="text-xs leading-5 text-muted-foreground animate-in fade-in duration-500">
          <span className="font-semibold text-accent">Tip:</span> {TIPS[tipIndex]}
        </p>
      </div>
    </div>
  );
}

// Structured criterion feedback: green "what worked" bullets + amber "to
// improve" bullets. Legacy results (a single `feedback` paragraph) still
// render, so old saved scores and the dashboard don't break.
export function CriterionFeedback({ criterion }) {
  const c = criterion || {};
  const strengths = Array.isArray(c.strengths) ? c.strengths : [];
  const improvements = Array.isArray(c.improvements) ? c.improvements : [];

  if (!strengths.length && !improvements.length) {
    return c.feedback ? (
      <p className="text-sm leading-relaxed text-muted-foreground">{c.feedback}</p>
    ) : null;
  }

  return (
    <div className="space-y-3">
      {strengths.length > 0 && (
        <ul className="space-y-1.5">
          {strengths.map((s, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}
      {improvements.length > 0 && (
        <ul className="space-y-1.5">
          {improvements.map((s, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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

// Props:
//   done       — flips true when the API result has arrived. Instead of
//                snapping away, the checklist fast-forwards through any
//                remaining stages (~300ms each), fills the bar to 100%, and
//                only then calls onFinished. The score reveal always follows
//                a completed animation arc.
//   onFinished — called exactly once after the accelerated run-through.
export function ScoringProgress({ done = false, onFinished }) {
  const [elapsed, setElapsed] = React.useState(0);
  const [tipIndex, setTipIndex] = React.useState(0);
  const [fastStage, setFastStage] = React.useState(null);
  const finishedRef = React.useRef(false);
  const onFinishedRef = React.useRef(onFinished);
  onFinishedRef.current = onFinished;

  React.useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setElapsed((Date.now() - started) / 1000), 250);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    const t = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 6000);
    return () => clearInterval(t);
  }, []);

  const timelineStage = STAGE_AT.reduce((acc, at, i) => (elapsed >= at ? i : acc), 0);
  const activeStage = fastStage != null ? fastStage : timelineStage;

  // Fast-forward once the result is in: complete each remaining stage on a
  // quick fixed beat, then hand off after a short hold at 100%.
  React.useEffect(() => {
    if (!done) return undefined;
    let stage = fastStage != null ? fastStage : timelineStage;
    setFastStage(stage);
    const t = setInterval(() => {
      if (stage < STAGES.length - 1) {
        stage += 1;
        setFastStage(stage);
        return;
      }
      clearInterval(t);
      setTimeout(() => {
        if (!finishedRef.current) {
          finishedRef.current = true;
          onFinishedRef.current?.();
        }
      }, 600);
    }, 300);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  // Normal mode: asymptotic progress that never quite reaches the end.
  // Accelerated mode: progress tracks the fast-forwarding stages to 100%.
  const progress =
    fastStage != null
      ? Math.round(((fastStage + 1) / STAGES.length) * 100)
      : Math.min(96, Math.round(100 * (1 - Math.exp(-elapsed / 22))));

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
          // During the final hold at 100%, the last stage checks off too.
          const runComplete = fastStage === STAGES.length - 1;
          const completed = i < activeStage || (runComplete && i === activeStage);
          const active = i === activeStage && !completed;
          return (
            <li
              key={label}
              className={cn(
                'flex items-center gap-3 text-sm transition-colors duration-300',
                completed ? 'text-foreground' : active ? 'font-medium text-foreground' : 'text-muted-foreground/60'
              )}
            >
              <span
                className={cn(
                  'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors duration-300',
                  completed
                    ? 'border-accent bg-accent text-accent-foreground'
                    : active
                      ? 'border-accent/60 bg-accent/10 text-accent'
                      : 'border-border bg-secondary/50 text-muted-foreground/50'
                )}
              >
                {completed ? (
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

// ---------------------------------------------------------------------------
// Result-modal visuals
// ---------------------------------------------------------------------------

// Official-style descriptor for a band score.
export function bandDescriptor(band) {
  if (typeof band !== 'number') return '';
  if (band >= 9) return 'Expert user';
  if (band >= 8) return 'Very good user';
  if (band >= 7) return 'Good user';
  if (band >= 6) return 'Competent user';
  if (band >= 5) return 'Modest user';
  if (band >= 4) return 'Limited user';
  return 'Keep practising';
}

// Big celebratory band donut for the top of the results modal.
export function BandHero({ band, subtitle }) {
  const value = typeof band === 'number' ? band : 0;
  const R = 42;
  const C = 2 * Math.PI * R;
  const filled = C * Math.min(1, value / 9);
  return (
    <div className="flex items-center gap-5 rounded-xl border border-border bg-gradient-to-br from-accent/10 via-card to-card px-5 py-4">
      <div className="relative h-28 w-28 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" strokeWidth="8" className="stroke-secondary" />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${C - filled}`}
            className="stroke-accent transition-[stroke-dasharray] duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-extrabold tabular-nums text-foreground">
            {typeof band === 'number' ? band.toFixed(1) : '—'}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Band
          </span>
        </div>
      </div>
      <div>
        <div className="text-lg font-bold text-foreground">{bandDescriptor(band)}</div>
        {subtitle ? <div className="mt-0.5 text-sm text-muted-foreground">{subtitle}</div> : null}
        <div className="mt-2 text-xs text-muted-foreground">
          Estimated against the official IELTS band descriptors.
        </div>
      </div>
    </div>
  );
}

// Thin band meter (band out of 9) for criterion cards.
export function BandMeter({ band }) {
  const pct = typeof band === 'number' ? Math.min(100, (band / 9) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

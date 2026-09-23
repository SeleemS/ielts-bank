import * as React from 'react';
import NextLink from 'next/link';
import { ArrowRight, Scale, ShieldCheck, Target, Lock } from 'lucide-react';
import { cn } from '../lib/utils';

// "How scoring works" in four honest statements. Every line maps to real
// behaviour and deliberately makes NO numeric accuracy claim: the measured
// figure lives on /ielts-writing-checker-accuracy and only appears once a
// publishable calibration run exists (lib/calibrationStats.js).
//   - rubric:      pages/api/score/writing.js scores each criterion, then
//                  calculateOverallBand() derives the overall band
//   - calibration: lib/writingCalibration.js (band 6/7 gates + anchors)
//   - privacy:     mirrors the checker FAQ "Do you store my essay?"
export const SCORING_POINTS = [
  {
    icon: Target,
    title: 'Marked on the four official criteria',
    body: 'Task Response (or Task Achievement), Coherence & Cohesion, Lexical Resource and Grammar each get their own band from the public band descriptors. The overall band is calculated from those four.',
  },
  {
    icon: Scale,
    title: 'Built to avoid over-marking',
    body: 'AI models tend to score IELTS essays too high. Our examiner applies strict Band 6/7 checks and worked anchor essays, and awards the lower band when an essay sits between two.',
  },
  {
    icon: ShieldCheck,
    title: 'An estimate, not an official score',
    body: 'Use it as a study guide. Only a certified examiner in a real test can give an official IELTS band.',
  },
  {
    icon: Lock,
    title: 'Your writing stays yours',
    body: 'Essays are saved to your account so you can track progress. We never sell or publish them, and you can ask us to delete them.',
  },
];

export default function ScoringExplainer({ className, compact = false }) {
  return (
    <section aria-labelledby="how-scoring-works" className={cn('mx-auto max-w-4xl', className)}>
      <h2
        id="how-scoring-works"
        className={cn(
          'text-center font-bold tracking-tight text-foreground',
          compact ? 'text-xl' : 'text-2xl sm:text-3xl'
        )}
      >
        How the scoring works
      </h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {SCORING_POINTS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-foreground">{title}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-sm">
        <NextLink
          href="/ielts-writing-checker-accuracy"
          className="inline-flex items-center gap-1 font-semibold text-accent no-underline hover:underline"
        >
          How we test the scorer&rsquo;s accuracy <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </NextLink>
      </p>
    </section>
  );
}

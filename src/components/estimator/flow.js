// src/components/estimator/flow.js
// Pure, React-free step-machine + result-assembly helpers for the Band
// Estimator. Kept separate from EstimatorRunner so the stepper's transitions,
// skip handling and final-result construction are unit-testable without a DOM.
//
// The six steps in order. `intro` and `results` bracket the four scored
// sections; only the four sections + results are "counted" in the progress
// indicator ("Step 2 of 5 · Listening") — intro is uncounted.

import { ESTIMATOR_VERSION } from '../../../lib/estimatorConfig';
import { overallEstimate } from './score';

export const STEPS = ['intro', 'reading', 'listening', 'writing', 'speaking', 'results'];

// Skills that produce a band, in section order. Writing is hybrid: its default
// short sample is measured, while the explicit fallback is self-assessed.
export const MEASURED_SKILLS = ['reading', 'listening', 'writing'];
export const SELF_ASSESSED_SKILLS = ['writing', 'speaking'];
export const SKILLS = ['reading', 'listening', 'writing', 'speaking'];

// Counted steps for the progress indicator (intro excluded, results included).
const COUNTED_STEPS = ['reading', 'listening', 'writing', 'speaking', 'results'];

const STEP_TITLES = {
  reading: 'Reading',
  listening: 'Listening',
  writing: 'Writing',
  speaking: 'Speaking',
  results: 'Your results',
};

export function isMeasured(step) {
  return MEASURED_SKILLS.includes(step);
}

export function isSelfAssessed(step) {
  return SELF_ASSESSED_SKILLS.includes(step);
}

// "Step 2 of 5 · Listening" — null for the (uncounted) intro step.
export function progressLabel(step) {
  const index = COUNTED_STEPS.indexOf(step);
  if (index === -1) return null;
  return {
    current: index + 1,
    total: COUNTED_STEPS.length,
    title: STEP_TITLES[step] || '',
    label: `Step ${index + 1} of ${COUNTED_STEPS.length} · ${STEP_TITLES[step] || ''}`,
  };
}

export function nextStep(step) {
  const index = STEPS.indexOf(step);
  if (index === -1 || index === STEPS.length - 1) return step;
  return STEPS[index + 1];
}

export function prevStep(step) {
  const index = STEPS.indexOf(step);
  if (index <= 0) return step;
  return STEPS[index - 1];
}

// ---------------------------------------------------------------------------
// Assemble the final result object persisted to localStorage
// ('ielts-estimator-result') and rendered by EstimatorResults.
//
// Inputs (all already reduced to their display shape by score.js):
//   reading / listening : number | null   (measured band; null when skipped)
//   writing : number | { min, max } | null (measured sample or self-assessed fallback)
//   speaking: { min, max } | null (self-assessed range; null when skipped)
//   skipped  : { reading, listening, writing, speaking }  (booleans)
//   targetBand : number | undefined
//   completedAt : ISO string (defaults to now)
//
// Output: { bands, overall, version, completedAt, targetBand?, sectionsSkipped }
//   bands mirrors the inputs (numbers for measured, {min,max} for self-assessed,
//   null for skipped); overall is the rounded mean midpoint across present
//   skills (null when < 2 present). sectionsSkipped is a comma-joined string of
//   skipped skill names (GA4-safe primitive).
// ---------------------------------------------------------------------------
export function buildResult({
  reading = null,
  listening = null,
  writing = null,
  speaking = null,
  skipped = {},
  targetBand,
  completedAt,
  writingLocked = false,
} = {}) {
  const bands = { reading, listening, writing, speaking };
  // When the Writing sample has been scored but not yet revealed (an anonymous
  // visitor), the client knows neither the Writing band nor a trustworthy
  // overall — computing an overall from the other three would quietly publish a
  // DIFFERENT number than the one they unlock. Both stay locked until sign-up.
  const { overall } = writingLocked
    ? { overall: null }
    : overallEstimate({ reading, listening, writing, speaking });
  const sectionsSkipped = SKILLS.filter((skill) => skipped[skill]);

  const result = {
    bands,
    overall,
    version: ESTIMATOR_VERSION,
    completedAt: completedAt || new Date().toISOString(),
    sectionsSkipped: sectionsSkipped.join(','),
  };
  if (writingLocked) result.writingLocked = true;
  if (typeof targetBand === 'number' && !Number.isNaN(targetBand)) {
    result.targetBand = targetBand;
  }
  return result;
}

// Count of scored questions actually attempted (measured sections that weren't
// skipped), used in the honest results caption. Each measured section is 10 Qs.
export function measuredQuestionCount({ reading = null, listening = null } = {}) {
  let count = 0;
  if (typeof reading === 'number') count += 10;
  if (typeof listening === 'number') count += 10;
  return count;
}

// The largest gap between a target band and each present skill's point estimate
// (midpoint for ranges). Returns { skill, gap } for the weakest skill vs target,
// or null when nothing is comparable. Used for "Biggest gap: Writing.".
export function biggestGap(bands, targetBand) {
  if (typeof targetBand !== 'number' || Number.isNaN(targetBand) || !bands) return null;
  let worst = null;
  for (const skill of SKILLS) {
    const value = bands[skill];
    let point = null;
    if (typeof value === 'number') point = value;
    else if (value && typeof value.min === 'number' && typeof value.max === 'number') {
      point = (value.min + value.max) / 2;
    }
    if (point === null) continue;
    const gap = targetBand - point;
    if (worst === null || gap > worst.gap) worst = { skill, gap };
  }
  return worst;
}

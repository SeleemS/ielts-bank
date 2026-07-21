import { describe, expect, it } from 'vitest';
import {
  STEPS,
  nextStep,
  prevStep,
  progressLabel,
  isMeasured,
  isSelfAssessed,
  buildResult,
  measuredQuestionCount,
  biggestGap,
} from './flow';
import { ESTIMATOR_VERSION } from '../../../lib/estimatorConfig';

describe('step machine', () => {
  it('orders the six steps intro → results', () => {
    expect(STEPS).toEqual(['intro', 'reading', 'listening', 'writing', 'speaking', 'results']);
  });

  it('advances forward and stops at the ends', () => {
    expect(nextStep('intro')).toBe('reading');
    expect(nextStep('reading')).toBe('listening');
    expect(nextStep('speaking')).toBe('results');
    expect(nextStep('results')).toBe('results'); // clamped
  });

  it('moves back and clamps at intro', () => {
    expect(prevStep('listening')).toBe('reading');
    expect(prevStep('intro')).toBe('intro'); // clamped
  });

  it('classifies measured vs self-assessed steps', () => {
    expect(isMeasured('reading')).toBe(true);
    expect(isMeasured('writing')).toBe(true);
    expect(isSelfAssessed('writing')).toBe(true);
    expect(isSelfAssessed('speaking')).toBe(true);
    expect(isSelfAssessed('listening')).toBe(false);
  });
});

describe('progressLabel', () => {
  it('returns null for the uncounted intro step', () => {
    expect(progressLabel('intro')).toBeNull();
  });

  it('numbers the four sections + results out of 5', () => {
    expect(progressLabel('reading')).toEqual({
      current: 1,
      total: 5,
      title: 'Reading',
      label: 'Step 1 of 5 · Reading',
    });
    expect(progressLabel('listening').label).toBe('Step 2 of 5 · Listening');
    expect(progressLabel('writing').label).toBe('Step 3 of 5 · Writing');
    expect(progressLabel('speaking').label).toBe('Step 4 of 5 · Speaking');
    expect(progressLabel('results').label).toBe('Step 5 of 5 · Your results');
  });
});

describe('buildResult', () => {
  it('assembles bands, overall, version and completedAt for a full run', () => {
    const result = buildResult({
      reading: 6.5,
      listening: 6.0,
      writing: { min: 5.5, max: 6.5 },
      speaking: { min: 6.0, max: 7.0 },
      targetBand: 7.0,
      completedAt: '2026-07-18T00:00:00.000Z',
    });
    expect(result.bands).toEqual({
      reading: 6.5,
      listening: 6.0,
      writing: { min: 5.5, max: 6.5 },
      speaking: { min: 6.0, max: 7.0 },
    });
    // midpoints 6.5, 6.0, 6.0, 6.5 -> mean 6.25 -> rounds up to 6.5.
    expect(result.overall).toBe(6.5);
    expect(result.version).toBe(ESTIMATOR_VERSION);
    expect(result.completedAt).toBe('2026-07-18T00:00:00.000Z');
    expect(result.targetBand).toBe(7.0);
    expect(result.sectionsSkipped).toBe('');
  });

  it('records skipped sections as null bands and lists them', () => {
    const result = buildResult({
      reading: 6.5,
      listening: 6.0,
      writing: { min: 5.5, max: 6.5 },
      speaking: null,
      skipped: { speaking: true },
    });
    expect(result.bands.speaking).toBeNull();
    expect(result.sectionsSkipped).toBe('speaking');
  });

  it('omits targetBand when not a number', () => {
    const result = buildResult({ reading: 6.0, listening: 6.0 });
    expect(result.targetBand).toBeUndefined();
    expect(result.overall).toBe(6.0);
  });

  it('yields a null overall when fewer than two skills are present', () => {
    const result = buildResult({ reading: 6.0, skipped: { listening: true, writing: true, speaking: true } });
    expect(result.overall).toBeNull();
  });
});

describe('measuredQuestionCount', () => {
  it('counts 10 questions per measured section actually taken', () => {
    expect(measuredQuestionCount({ reading: 6.5, listening: 6.0 })).toBe(20);
    expect(measuredQuestionCount({ reading: 6.5, listening: null })).toBe(10);
    expect(measuredQuestionCount({})).toBe(0);
  });
});

describe('biggestGap', () => {
  it('finds the skill furthest below the target (range uses its midpoint)', () => {
    const bands = {
      reading: 6.5,
      listening: 7.0,
      writing: { min: 5.0, max: 6.0 }, // midpoint 5.5 — furthest from 7.0
      speaking: { min: 6.0, max: 7.0 },
    };
    expect(biggestGap(bands, 7.0)).toEqual({ skill: 'writing', gap: 1.5 });
  });

  it('returns null without a numeric target', () => {
    expect(biggestGap({ reading: 6 }, null)).toBeNull();
  });
});

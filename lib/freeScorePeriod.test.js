import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FREE_SCORE_WINDOW_DAYS,
  formatFreeScoreDate,
  freeScoreCopy,
  isFreeSampleUsed,
  nextFreeScoreAt,
  nextFreeScoreHint,
  resolveFreeScorePeriod,
} from './freeScorePeriod';

const USED = '2026-09-23T10:00:00.000Z';
const DAY = 24 * 60 * 60 * 1000;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('free score period flag', () => {
  it('defaults to the lifetime behaviour for anything but "weekly"', () => {
    expect(resolveFreeScorePeriod(undefined)).toBe('lifetime');
    expect(resolveFreeScorePeriod('')).toBe('lifetime');
    expect(resolveFreeScorePeriod('monthly')).toBe('lifetime');
    expect(resolveFreeScorePeriod('lifetime')).toBe('lifetime');
    expect(resolveFreeScorePeriod(' Weekly ')).toBe('weekly');
  });

  it('reads NEXT_PUBLIC_FREE_SCORE_PERIOD at module load (build time in Next)', async () => {
    vi.stubEnv('NEXT_PUBLIC_FREE_SCORE_PERIOD', 'weekly');
    vi.resetModules();
    const weekly = await import('./freeScorePeriod');
    expect(weekly.FREE_SCORE_PERIOD).toBe('weekly');
    expect(weekly.IS_WEEKLY_FREE_SCORE).toBe(true);
    expect(weekly.freeScoreCopy().allowanceLine).toMatch(/every week/);

    vi.stubEnv('NEXT_PUBLIC_FREE_SCORE_PERIOD', '');
    vi.resetModules();
    const lifetime = await import('./freeScorePeriod');
    expect(lifetime.FREE_SCORE_PERIOD).toBe('lifetime');
    expect(lifetime.freeScoreCopy().allowanceLine).toMatch(/lifetime/);
  });

  it('keeps the window in lockstep with the SQL migration', () => {
    const sql = readFileSync(
      new URL('../supabase/migrations/20260923120000_weekly_free_ai_score.sql', import.meta.url),
      'utf8'
    );
    expect(sql).toContain(`v_free_window constant interval := interval '${FREE_SCORE_WINDOW_DAYS} days'`);
  });
});

describe('free sample state (display mirror of consume_ai_score)', () => {
  it('lifetime: any recorded use means used, and there is never a refill date', () => {
    expect(isFreeSampleUsed(null, { period: 'lifetime' })).toBe(false);
    expect(isFreeSampleUsed(USED, { period: 'lifetime', now: Date.parse(USED) + 400 * DAY })).toBe(true);
    expect(nextFreeScoreAt(USED, 'lifetime')).toBeNull();
    expect(nextFreeScoreHint(Date.parse(USED) + 7 * DAY, { period: 'lifetime' })).toBe('');
  });

  it('weekly: used for 7 days, available again at exactly 7 days', () => {
    const used = Date.parse(USED);
    expect(isFreeSampleUsed(null, { period: 'weekly' })).toBe(false);
    expect(isFreeSampleUsed(USED, { period: 'weekly', now: used + 6 * DAY })).toBe(true);
    expect(isFreeSampleUsed(USED, { period: 'weekly', now: used + 7 * DAY - 1 })).toBe(true);
    expect(isFreeSampleUsed(USED, { period: 'weekly', now: used + 7 * DAY })).toBe(false);
    expect(nextFreeScoreAt(USED, 'weekly').toISOString()).toBe('2026-09-30T10:00:00.000Z');
    expect(nextFreeScoreAt(null, 'weekly')).toBeNull();
    expect(nextFreeScoreAt('not a date', 'weekly')).toBeNull();
  });

  it('formats the unlock hint per skill in the viewer time zone', () => {
    // ICU versions differ on "Sep" vs "Sept".
    expect(formatFreeScoreDate('2026-09-30T10:00:00.000Z', { timeZone: 'UTC' })).toMatch(/^Wed 30 Sept?$/);
    expect(
      nextFreeScoreHint('2026-09-30T10:00:00.000Z', { period: 'weekly', timeZone: 'UTC' })
    ).toMatch(/^Your next free Writing score unlocks on Wed 30 Sept?\.$/);
    expect(
      nextFreeScoreHint('2026-09-30T23:30:00.000Z', { skill: 'speaking', period: 'weekly', timeZone: 'Asia/Singapore' })
    ).toBe('Your next free Speaking score unlocks on Thu 1 Oct.');
    expect(nextFreeScoreHint(null, { period: 'weekly' })).toBe('');
  });
});

describe('free score copy', () => {
  it('has the same keys in both modes so no surface can render undefined', () => {
    expect(Object.keys(freeScoreCopy('weekly')).sort()).toEqual(Object.keys(freeScoreCopy('lifetime')).sort());
  });

  it('never says "lifetime" in weekly mode, and keeps today’s wording by default', () => {
    for (const text of Object.values(freeScoreCopy('weekly'))) {
      expect(text).not.toMatch(/lifetime|per account/i);
    }
    expect(freeScoreCopy('lifetime').allowanceLine).toBe('One lifetime Writing sample + one Speaking sample score');
    expect(freeScoreCopy('weekly').allowanceLine).toBe('1 free AI Writing + 1 free AI Speaking score every week');
  });
});

describe('flag-driven surfaces', () => {
  // Every user-facing "lifetime sample" string must come from freeScoreCopy()
  // so NEXT_PUBLIC_FREE_SCORE_PERIOD flips all of them together.
  const surfaces = [
    'pages/pricing.jsx',
    'pages/ielts-writing-checker.jsx',
    'pages/ielts-writing-checker/[task].jsx',
    'pages/dashboard.js',
    'pages/speakingquestion/index.js',
    'src/pages/HomePage.js',
    'src/components/PracticeFeedbackEntry.jsx',
    'src/components/AiQuotaPanel.jsx',
    'src/components/question/FreeSampleChip.jsx',
    'lib/lifecycleEmail.js',
  ];
  it.each(surfaces)('%s has no hard-coded lifetime allowance copy', (file) => {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    expect(source).not.toMatch(/lifetime/i);
    expect(source).toMatch(/freeScoreCopy|nextFreeScoreHint/);
  });
});

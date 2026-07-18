import { describe, expect, it } from 'vitest';
import {
  bandDescriptor,
  buildDashboardData,
  getInitials,
  passageHref,
  prettyQuestionType,
} from './utils';

describe('dashboard transforms', () => {
  it('builds stable passage routes', () => {
    expect(passageHref({ skill: 'reading', slug: 'sample' })).toBe('/readingquestion/sample');
    expect(passageHref(null)).toBeNull();
  });

  it('aggregates accuracy, mistakes, criteria and streak inputs', () => {
    const attempts = [{
      id: 'a1', skill: 'reading', raw_score: 1, total: 2, band: 5,
      submitted_at: new Date().toISOString(), passages: { title: 'Passage', slug: 'p', skill: 'reading' },
      per_question: { 1: { correct: true, questionType: 'short_answer' }, 2: { correct: false, questionType: 'short_answer' } },
    }];
    const scores = [{ id: 's1', skill: 'writing', overall_band: 6.5, created_at: new Date().toISOString(), criteria: { lexicalResource: { band: 6.5 } }, attempts: null }];
    const result = buildDashboardData(attempts, scores);
    expect(result.totalPractised).toBe(2);
    expect(result.typeAccuracy[0]).toMatchObject({ type: 'short_answer', correct: 1, total: 2, percentage: 50 });
    expect(result.mistakes[0]).toMatchObject({ wrong: 1, href: '/readingquestion/p' });
    expect(result.criteria.lexicalResource).toEqual([6.5]);
    expect(result.streak).toBe(1);
  });

  it('builds progress KPIs, durations, recommendations and latest-band deltas', () => {
    const now = new Date();
    const readingStart = new Date(now.getTime() - 20 * 60_000).toISOString();
    const writingStart = new Date(now.getTime() - 55 * 60_000).toISOString();
    const attempts = [
      {
        id: 'r1', skill: 'reading', raw_score: 28, total: 40, band: 6.5,
        started_at: readingStart, submitted_at: now.toISOString(),
        passages: { title: 'First', slug: 'first', skill: 'reading' },
      },
      {
        id: 'r2', skill: 'reading', raw_score: 31, total: 40, band: 7,
        started_at: readingStart, submitted_at: now.toISOString(),
        passages: { title: 'Second', slug: 'second', skill: 'reading' },
      },
    ];
    const scores = [{
      id: 'w1', skill: 'writing', overall_band: 6, created_at: now.toISOString(), criteria: {},
      attempts: {
        started_at: writingStart,
        submitted_at: new Date(now.getTime() - 25 * 60_000).toISOString(),
        passages: { title: 'Essay', slug: 'essay', skill: 'writing' },
      },
    }];

    const result = buildDashboardData(attempts, scores);
    expect(result.skills.reading).toMatchObject({ latest: 7, previous: 6.5, delta: 0.5 });
    expect(result.overallBand).toBe(6.5);
    expect(result.strongestSkill).toBe('reading');
    expect(result.recommendedSkill).toBe('listening');
    expect(result.totalMinutes).toBe(70);
    expect(result.weeklyCount).toBe(3);
    expect(result.activity).toHaveLength(28);
  });

  it('formats learner-facing labels and initials safely', () => {
    expect(getInitials('Ada Lovelace', 'ada@example.com')).toBe('AL');
    expect(getInitials('', 'student@example.com')).toBe('S');
    expect(prettyQuestionType('matching-headings')).toBe('Matching Headings');
    expect(bandDescriptor(7.5)).toBe('Good');
    expect(bandDescriptor(null)).toBe('Start practising');
  });
});

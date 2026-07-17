import { describe, expect, it } from 'vitest';
import { buildDashboardData, passageHref } from './utils';

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
});

import { describe, expect, it } from 'vitest';
import { canonicalizeSpelling, estimateBand, gradeAll, gradeQuestion, normalizeText } from './grade';

const question = (answerKey) => ({ number: 1, answerKey });

describe('question grading', () => {
  it('normalizes whitespace and case', () => {
    expect(normalizeText('  Not   Given ')).toBe('not given');
  });

  it('canonicalizes common UK and US spelling variants symmetrically', () => {
    expect(canonicalizeSpelling('organisation colour centre')).toBe('organization color center');
  });

  it('requires an exact set for multi-select questions', () => {
    const group = { questionType: 'multiple_choice_multi', options: [{ key: 'A', text: 'One' }, { key: 'C', text: 'Three' }] };
    const q = question({ correctOptionKeys: ['A', 'C'] });
    expect(gradeQuestion(group, q, ['C', 'A']).correct).toBe(true);
    expect(gradeQuestion(group, q, ['A']).correct).toBe(false);
  });

  it('enforces completion word limits', () => {
    const group = { questionType: 'sentence_completion' };
    const q = question({ accepted: ['solar energy'], wordLimit: 2, normalize: 'lower_trim' });
    expect(gradeQuestion(group, q, 'solar energy').correct).toBe(true);
    expect(gradeQuestion(group, q, 'clean solar energy')).toMatchObject({ correct: false, overLimit: true });
  });

  it('grades a passage by continuous global question number', () => {
    const groups = [{ questionType: 'short_answer', questions: [
      { number: 7, answerKey: { accepted: ['river'] } },
      { number: 8, answerKey: { accepted: ['forest'] } },
    ] }];
    expect(gradeAll(groups, { 7: 'River', 8: 'desert' })).toMatchObject({ score: 1, total: 2 });
  });

  it('uses the module-aware forty-question band conversion', () => {
    expect(estimateBand(30, 40, 'reading', 'academic')).not.toBe(estimateBand(30, 40, 'reading', 'general'));
    expect(estimateBand(30, 40, 'listening')).toBeTypeOf('number');
  });
});

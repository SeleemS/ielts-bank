import { describe, expect, it } from 'vitest';
import {
  canonicalizeSpelling,
  cleanGroupPrompt,
  estimateBand,
  gradeAll,
  gradeQuestion,
  normalizeText,
  stripOptionKeyPrefix,
} from './grade';

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

  it('strips a duplicated option key from the option text', () => {
    expect(stripOptionKeyPrefix('A', 'A) It suits a small space.')).toBe('It suits a small space.');
    expect(stripOptionKeyPrefix('B', 'B. Browns provide carbon.')).toBe('Browns provide carbon.');
    expect(stripOptionKeyPrefix('C', '(C) A closed bin.')).toBe('A closed bin.');
    // A different letter, or a legitimate word, is left alone.
    expect(stripOptionKeyPrefix('A', 'B) Not this option.')).toBe('B) Not this option.');
    expect(stripOptionKeyPrefix('A', 'Alligators eat greens.')).toBe('Alligators eat greens.');
    expect(stripOptionKeyPrefix('A', 'A)')).toBe('A)');
  });

  it('drops the redundant "Question N:" lead-in from group prompts', () => {
    expect(cleanGroupPrompt('Question 7: Choose the correct letter, A, B, C or D.')).toBe(
      'Choose the correct letter, A, B, C or D.'
    );
    expect(cleanGroupPrompt('Questions 1–6: Do the statements agree?')).toBe(
      'Do the statements agree?'
    );
    expect(cleanGroupPrompt('Section 2 · Question 15: Choose one answer.')).toBe(
      'Section 2 · Choose one answer.'
    );
    expect(cleanGroupPrompt('Label the town map. Where is each place?')).toBe(
      'Label the town map. Where is each place?'
    );
  });
});

// Guards the integrity filter in toStructuredPassageShape: half-ingested
// questions the app cannot mark (empty answer keys, or matching/MC groups with
// no option bank) must never reach a renderer, and the survivors must keep a
// continuous 1..N numbering. Regression cover for the "42 ungradeable
// questions" defect (2026-07-20 audit).
import { describe, expect, it } from 'vitest';
import { questionIsGradeable, toStructuredPassageShape } from '../lib/supabase';

const ak = (over = {}) => ({
  accepted: [],
  correct_option_keys: [],
  spelling_variants: false,
  word_limit: null,
  normalize: 'lower_trim',
  explanation: '',
  ...over,
});

function makeRow(groups) {
  return {
    id: 'p1',
    slug: 'sample',
    skill: 'reading',
    module: 'academic',
    title: 'Sample',
    body_html: '<p>Body</p>',
    question_groups: groups,
  };
}

describe('questionIsGradeable', () => {
  it('accepts a completion/boolean question with accepted answers', () => {
    expect(questionIsGradeable({ options: [] }, { answerKey: { accepted: ['milk'] } })).toBe(true);
  });
  it('accepts a choice question with keys AND an option bank', () => {
    expect(
      questionIsGradeable({ options: [{ key: 'A' }] }, { answerKey: { correctOptionKeys: ['A'] } })
    ).toBe(true);
  });
  it('rejects a choice question whose group has no options', () => {
    expect(
      questionIsGradeable({ options: [] }, { answerKey: { correctOptionKeys: ['A'] } })
    ).toBe(false);
  });
  it('rejects a question with no accepted answers and no option keys', () => {
    expect(questionIsGradeable({ options: [] }, { answerKey: { accepted: [], correctOptionKeys: [] } })).toBe(false);
  });
});

describe('toStructuredPassageShape integrity guard', () => {
  it('drops a matching group with no options + empty keys, keeps the good group, renumbers continuously', () => {
    const row = makeRow([
      {
        id: 'g-broken',
        position: 0,
        question_type: 'matching_information',
        prompt: 'Questions 1-3. Which paragraph...',
        group_options: [], // no bank -> unanswerable
        questions: [
          { id: 'q1', position: 0, global_number: 1, prompt_text: 'x', answer_keys: [ak()] },
          { id: 'q2', position: 1, global_number: 2, prompt_text: 'y', answer_keys: [ak()] },
          { id: 'q3', position: 2, global_number: 3, prompt_text: 'z', answer_keys: [ak()] },
        ],
      },
      {
        id: 'g-good',
        position: 1,
        question_type: 'true_false_notgiven',
        prompt: 'Questions 4-5.',
        group_options: [],
        questions: [
          { id: 'q4', position: 0, global_number: 4, prompt_text: 'a', answer_keys: [ak({ accepted: ['true'] })] },
          { id: 'q5', position: 1, global_number: 5, prompt_text: 'b', answer_keys: [ak({ accepted: ['false'] })] },
        ],
      },
    ]);

    const shaped = toStructuredPassageShape(row);
    expect(shaped.groups).toHaveLength(1);
    expect(shaped.groups[0].id).toBe('g-good');
    // Survivors renumber 1..N — no gap left by the dropped group.
    expect(shaped.groups[0].questions.map((q) => q.number)).toEqual([1, 2]);
  });

  it('drops individual ungradeable questions inside an otherwise valid group', () => {
    const row = makeRow([
      {
        id: 'g',
        position: 0,
        question_type: 'short_answer',
        prompt: 'Questions 1-3.',
        group_options: [],
        questions: [
          { id: 'q1', position: 0, global_number: 1, prompt_text: 'a', answer_keys: [ak({ accepted: ['tea'] })] },
          { id: 'q2', position: 1, global_number: 2, prompt_text: 'b', answer_keys: [ak()] }, // broken
          { id: 'q3', position: 2, global_number: 3, prompt_text: 'c', answer_keys: [ak({ accepted: ['milk'] })] },
        ],
      },
    ]);
    const shaped = toStructuredPassageShape(row);
    expect(shaped.groups[0].questions.map((q) => q.promptText)).toEqual(['a', 'c']);
    expect(shaped.groups[0].questions.map((q) => q.number)).toEqual([1, 2]);
  });

  it('keeps a valid matching group with options + keys', () => {
    const row = makeRow([
      {
        id: 'g',
        position: 0,
        question_type: 'matching_information',
        prompt: 'Questions 1-2.',
        group_options: [
          { option_key: 'A', display_text: 'Para A', position: 0 },
          { option_key: 'B', display_text: 'Para B', position: 1 },
        ],
        questions: [
          { id: 'q1', position: 0, global_number: 1, prompt_text: 'a', answer_keys: [ak({ correct_option_keys: ['A'] })] },
          { id: 'q2', position: 1, global_number: 2, prompt_text: 'b', answer_keys: [ak({ correct_option_keys: ['B'] })] },
        ],
      },
    ]);
    const shaped = toStructuredPassageShape(row);
    expect(shaped.groups).toHaveLength(1);
    expect(shaped.groups[0].questions).toHaveLength(2);
  });
});

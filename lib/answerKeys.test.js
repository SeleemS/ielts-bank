import { describe, expect, it } from 'vitest';
import {
  answerDisplay,
  answerPageDescription,
  answerPageEligible,
  answerPageJsonLd,
  answerPageTitle,
  answersPath,
  bandRowsForPassage,
  blockLocation,
  buildAnswerKey,
  findBestSentence,
  findVerbatimBlock,
  practicePageTitle,
  splitBlocks,
  splitSentences,
} from './answerKeys';
import { toStructuredPassageShape } from './supabase';
import { estimateBand } from '../src/components/question/grade';

const ak = (over = {}) => ({
  accepted: [],
  correct_option_keys: [],
  spelling_variants: false,
  word_limit: null,
  normalize: 'lower_trim',
  explanation: 'Some explanation.',
  ...over,
});

const BODY =
  '<p><strong>A</strong> Vitamins are organic compounds. The body cannot make most of them for itself, so they must come from food.</p>' +
  '<p><strong>B</strong> Vitamins do not provide energy in the way that sugars or fats do. Instead, they act as helpers in the chemical reactions that keep the body running.</p>' +
  '<p><strong>C</strong> Fat-soluble vitamins can be stored in the liver. Water-soluble vitamins are mostly lost in the urine, so they need replacing regularly.</p>';

function readingRow(overrides = {}) {
  return {
    id: 'p1',
    slug: 'why-the-body-needs-vitamins-abc',
    legacy_firestore_id: null,
    skill: 'reading',
    module: 'academic',
    title: 'Why the Body Needs Vitamins',
    difficulty: 'medium',
    body_html: BODY,
    question_groups: [
      {
        id: 'g1',
        position: 0,
        question_type: 'true_false_notgiven',
        prompt: 'Do the following statements agree with the information given in the passage?',
        group_options: [],
        questions: [
          {
            id: 'q1',
            position: 0,
            prompt_text: 'The body is unable to produce most vitamins.',
            answer_keys: [ak({ accepted: ['true'], explanation: 'The body cannot make most of them for itself, so they must come from food.' })],
          },
          {
            id: 'q2',
            position: 1,
            prompt_text: 'Vitamins are a major source of energy.',
            answer_keys: [ak({ accepted: ['false'], explanation: 'Vitamins do not provide energy in the way that sugars or fats do.' })],
          },
        ],
      },
      {
        id: 'g2',
        position: 1,
        question_type: 'multiple_choice',
        prompt: 'Question 3: Choose the correct letter, A, B, C or D.',
        group_options: [
          { option_key: 'A', display_text: 'A) To provide energy', position: 0 },
          { option_key: 'B', display_text: 'B) To help chemical reactions', position: 1 },
        ],
        questions: [
          {
            id: 'q3',
            position: 0,
            prompt_text: 'What is the main role of vitamins?',
            answer_keys: [
              ak({
                correct_option_keys: ['B'],
                explanation: 'The writer explains that vitamins work as helpers in the body’s chemical reactions rather than as fuel.',
              }),
            ],
          },
        ],
      },
      {
        id: 'g3',
        position: 2,
        question_type: 'sentence_completion',
        prompt: 'Complete the sentence.',
        group_options: [],
        questions: [
          {
            id: 'q4',
            position: 0,
            prompt_text: 'Fat-soluble vitamins can be kept in the ______.',
            answer_keys: [ak({ accepted: ['liver'], word_limit: 1, explanation: 'Fat-soluble vitamins can be stored in the liver.' })],
          },
        ],
      },
    ],
    ...overrides,
  };
}

const passage = () => toStructuredPassageShape(readingRow());

describe('splitBlocks / locations', () => {
  it('detects sequential IELTS paragraph letters', () => {
    const blocks = splitBlocks(BODY);
    expect(blocks.map((b) => b.letter)).toEqual(['A', 'B', 'C']);
    expect(blocks[0].text.startsWith('Vitamins are organic')).toBe(true);
    expect(blockLocation(blocks[1])).toBe('Paragraph B');
  });

  it('numbers plain paragraphs, including legacy <br><br> bodies', () => {
    const blocks = splitBlocks(' First paragraph here. <br><br> Second paragraph here. <br><br> Third one.');
    expect(blocks).toHaveLength(3);
    expect(blockLocation(blocks[2])).toBe('Paragraph 3');
  });

  it('scopes paragraph numbers to General Training "Text A" sections', () => {
    const blocks = splitBlocks('<h3>Text A — Swimming pool</h3><p>One.</p><p>Two.</p><h3>Text B — Library</h3><p>Three.</p>');
    expect(blocks.map((b) => blockLocation(b))).toEqual([
      'Text A, paragraph 1',
      'Text A, paragraph 2',
      'Text B, paragraph 1',
    ]);
  });

  it('does not treat a lone bold capital as a paragraph label', () => {
    const blocks = splitBlocks('<p><strong>A</strong> note.</p><p>Plain.</p>');
    expect(blocks[0].letter).toBeNull();
  });

  it('labels listening transcript lines with the speaker', () => {
    const blocks = splitBlocks('<h3>Part 1</h3><p><strong>Receptionist:</strong> Good morning.</p><p><strong>Tom:</strong> Hi, I would like to book a taxi.</p>');
    expect(blockLocation(blocks[1], 'listening')).toBe('Transcript, paragraph 2 (Tom)');
    expect(blocks[1].text).toBe('Hi, I would like to book a taxi.');
  });

  it('splits sentences without breaking on lowercase continuations', () => {
    expect(splitSentences('It costs £40. That includes a vest. e.g. not split')).toEqual([
      'It costs £40.',
      'That includes a vest. e.g. not split',
    ]);
  });
});

describe('evidence finders', () => {
  it('finds a verbatim explanation, ignoring punctuation and entity differences', () => {
    const blocks = splitBlocks(BODY.replace("do not", 'do&nbsp;not'));
    const block = findVerbatimBlock(blocks, '“Vitamins do not provide energy in the way that sugars or fats do.”');
    expect(block.letter).toBe('B');
  });

  it('handles ellipsis-joined excerpts', () => {
    const blocks = splitBlocks(BODY);
    const block = findVerbatimBlock(
      blocks,
      'Fat-soluble vitamins can be stored in the liver... they need replacing regularly'
    );
    expect(block.letter).toBe('C');
  });

  it('rejects paraphrases as verbatim', () => {
    expect(findVerbatimBlock(splitBlocks(BODY), 'Vitamins are a kind of fuel for people and animals alike.')).toBeNull();
  });

  it('locates the transcript sentence for a paraphrased listening explanation', () => {
    const blocks = splitBlocks(
      '<p>We meet three times a week. There is a session every Tuesday and Thursday evening, and a longer run on Sunday mornings at nine o\'clock.</p>' +
        '<p>It costs forty pounds a year, which includes insurance and a club vest.</p>'
    );
    const best = findBestSentence(blocks, {
      explanation: 'Angela says the annual membership costs forty pounds, including insurance.',
      answerText: 'forty pounds',
      promptText: 'Annual membership fee',
      answerIsVerbatim: true,
    });
    expect(best.sentence).toMatch(/^It costs forty pounds/);
    expect(blockLocation(best.block, 'listening')).toBe('Transcript, paragraph 2');
  });

  it('returns null rather than a weak guess', () => {
    const best = findBestSentence(splitBlocks(BODY), {
      explanation: 'Nothing about submarines or volcanoes here.',
      promptText: 'Submarines',
    });
    expect(best).toBeNull();
  });
});

describe('answerDisplay', () => {
  const p = passage();
  it('uppercases boolean answers', () => {
    expect(answerDisplay(p.groups[0], p.groups[0].questions[0]).short).toBe('TRUE');
  });
  it('shows option key with its text, without the doubled "B)" prefix', () => {
    expect(answerDisplay(p.groups[1], p.groups[1].questions[0]).full).toBe('B — To help chemical reactions');
  });
  it('avoids "C — Paragraph C" for paragraph banks', () => {
    const group = { questionType: 'matching_information', options: [{ key: 'C', text: 'Paragraph C' }] };
    expect(answerDisplay(group, { answerKey: { correctOptionKeys: ['C'] } }).full).toBe('Paragraph C');
  });
  it('lists alternative accepted spellings for completion answers', () => {
    const group = { questionType: 'note_completion', options: [] };
    const a = answerDisplay(group, { answerKey: { accepted: ['200', 'two hundred'] } });
    expect(a.short).toBe('200');
    expect(a.alsoAccepted).toEqual(['two hundred']);
  });
});

describe('answerPageEligible', () => {
  it('accepts a complete, fully explained passage', () => {
    expect(answerPageEligible(passage())).toBe(true);
  });

  it('rejects a passage that lost an ungradeable question', () => {
    const row = readingRow();
    row.question_groups[0].questions.push({ id: 'broken', position: 2, prompt_text: 'x', answer_keys: [ak({ explanation: 'x' })] });
    const shaped = toStructuredPassageShape(row);
    expect(shaped.droppedQuestionCount).toBe(1);
    expect(answerPageEligible(shaped)).toBe(false);
  });

  it('rejects a passage with any missing explanation', () => {
    const row = readingRow();
    row.question_groups[2].questions[0].answer_keys = [ak({ accepted: ['liver'], explanation: '  ' })];
    expect(answerPageEligible(toStructuredPassageShape(row))).toBe(false);
  });

  it('rejects titles on the Cambridge-collision denylist', () => {
    expect(answerPageEligible(toStructuredPassageShape(readingRow({ title: 'Endless Harvest' })))).toBe(false);
  });

  it('rejects writing/speaking and listening without a transcript', () => {
    expect(answerPageEligible({ ...passage(), skill: 'writing' })).toBe(false);
    expect(answerPageEligible({ ...passage(), skill: 'listening', transcriptHtml: '' })).toBe(false);
    expect(answerPageEligible(null)).toBe(false);
  });
});

describe('bandRowsForPassage', () => {
  it('covers every raw score once and agrees with the practice-page estimate', () => {
    const rows = bandRowsForPassage(13, 'reading', 'academic');
    const covered = rows.flatMap((r) => Array.from({ length: r.max - r.min + 1 }, (_, i) => r.min + i));
    expect(covered.sort((a, b) => a - b)).toEqual(Array.from({ length: 14 }, (_, i) => i));
    rows.forEach((r) => {
      for (let s = r.min; s <= r.max; s += 1) expect(estimateBand(s, 13, 'reading', 'academic')).toBe(r.band);
    });
    expect(rows[0]).toMatchObject({ max: 13, band: 9 });
  });

  it('uses the stricter General Training table for GT passages', () => {
    const academic = bandRowsForPassage(10, 'reading', 'academic');
    const general = bandRowsForPassage(10, 'reading', 'general');
    const bandAt = (rows, s) => rows.find((r) => s >= r.min && s <= r.max).band;
    expect(bandAt(general, 7)).toBeLessThan(bandAt(academic, 7));
  });
});

describe('buildAnswerKey', () => {
  const key = buildAnswerKey(passage(), 'reading');

  it('keeps the practice engine’s continuous numbering and group ranges', () => {
    expect(key.groups.map((g) => g.range)).toEqual(['Questions 1–2', 'Question 3', 'Question 4']);
    expect(key.groups.flatMap((g) => g.questions.map((q) => q.number))).toEqual([1, 2, 3, 4]);
    expect(key.total).toBe(4);
    // Redundant "Question 3:" lead-in stripped exactly like QuestionGroup.
    expect(key.groups[1].prompt).toBe('Choose the correct letter, A, B, C or D.');
  });

  it('turns a verbatim explanation into located evidence plus reasoning', () => {
    const q2 = key.groups[0].questions[1];
    expect(q2.answer).toBe('FALSE');
    expect(q2.evidence).toMatchObject({ exact: true, location: 'Paragraph B', label: 'Evidence' });
    expect(q2.reasoning).toMatch(/contradicts the statement/);
    expect(q2.explanationHtml).toBe('');
  });

  it('keeps a paraphrased explanation and adds the best-matching sentence', () => {
    const q3 = key.groups[1].questions[0];
    expect(q3.explanationHtml).toMatch(/helpers/);
    expect(q3.evidence).toMatchObject({ exact: false, location: 'Paragraph B' });
    expect(q3.evidence.quote).toMatch(/act as helpers/);
  });

  it('builds links, summary, tips and SEO fields', () => {
    expect(key.answersHref).toBe('/readingquestion/why-the-body-needs-vitamins-abc/answers');
    expect(key.practiceHref).toBe('/readingquestion/why-the-body-needs-vitamins-abc');
    expect(key.summary.lead).toMatch(/^Vitamins are organic compounds/);
    expect(key.summary.typeLabels).toEqual(['True / False / Not Given', 'Multiple Choice', 'Sentence Completion']);
    expect(key.tips.map((t) => t.href)).toEqual([
      '/reading/true-false-not-given',
      '/reading/multiple-choice',
      '/reading/sentence-completion',
    ]);
    expect(answerPageTitle(key.title, 'reading')).toBe(
      'Why the Body Needs Vitamins Reading Answers with Explanations (IELTS Practice)'
    );
    expect(answerPageDescription(key)).toMatch(/all 4 questions/);
  });

  it('prefers the legacy id for the practice link (the practice page canonical)', () => {
    const k = buildAnswerKey(toStructuredPassageShape(readingRow({ legacy_firestore_id: 'abc123' })), 'reading');
    expect(k.practiceHref).toBe('/readingquestion/abc123');
    expect(k.answersHref).toBe(answersPath('reading', 'why-the-body-needs-vitamins-abc'));
  });

  it('emits Article + BreadcrumbList JSON-LD (no QAPage/FAQPage)', () => {
    const ld = answerPageJsonLd(key, { description: 'd' });
    expect(ld['@graph'].map((n) => n['@type'])).toEqual(['Article', 'BreadcrumbList']);
    expect(JSON.stringify(ld)).not.toMatch(/QAPage|FAQPage/);
    expect(ld['@graph'][1].itemListElement.at(-1).item).toBe(
      'https://www.ielts-bank.com/readingquestion/why-the-body-needs-vitamins-abc/answers'
    );
  });

  it('builds listening keys with transcript evidence and part tips', () => {
    const shaped = toStructuredPassageShape({
      id: 'l1',
      slug: 'booking-an-airport-taxi-x1',
      skill: 'listening',
      title: 'Booking an Airport Taxi',
      listening_details: [
        {
          audio_path: null,
          part: 1,
          transcript_html:
            '<h3>Part 1</h3><p><strong>Operator:</strong> What time is your flight?</p><p><strong>Caller:</strong> It leaves at a quarter past seven in the evening, from Terminal 2.</p>',
        },
      ],
      question_groups: [
        {
          id: 'g',
          position: 0,
          question_type: 'form_completion',
          prompt: 'Complete the form.',
          group_options: [],
          questions: [
            {
              id: 'q',
              position: 0,
              prompt_text: 'Departure terminal: Terminal ______',
              answer_keys: [ak({ accepted: ['2'], explanation: 'The caller says the flight departs from Terminal 2 in the evening.' })],
            },
          ],
        },
      ],
    });
    expect(answerPageEligible(shaped)).toBe(true);
    const k = buildAnswerKey(shaped, 'listening');
    const q = k.groups[0].questions[0];
    expect(q.evidence.location).toBe('Transcript, paragraph 2 (Caller)');
    expect(q.evidence.label).toBe('What you hear');
    expect(k.tips[0]).toMatchObject({ href: '/listening/part-1', label: 'Listening Part 1' });
    expect(k.module).toBeNull();
    expect(k.bandRows[0].band).toBe(9);
  });
});

describe('practicePageTitle', () => {
  it('puts the passage title first and says "with Answers" only when a key page exists', () => {
    expect(practicePageTitle('Why the Body Needs Vitamins', 'reading', true)).toBe(
      'Why the Body Needs Vitamins – IELTS Reading Practice Test with Answers'
    );
    expect(practicePageTitle('Booking an Airport Taxi', 'listening', true)).toBe(
      'Booking an Airport Taxi – IELTS Listening Practice Test with Answers'
    );
    expect(practicePageTitle('Endless Harvest', 'reading', false)).toBe(
      'Endless Harvest | IELTS Reading Practice | IELTS-Bank'
    );
    expect(practicePageTitle('', 'reading', true)).toBe('IELTS Reading Practice | IELTS-Bank');
  });
});

import { describe, expect, it } from 'vitest';
import {
  essays,
  essaySlugs,
  essaysForBlogPost,
  getEssayBySlug,
  getEssaysForPractice,
  parseEssay,
  relatedEssays,
} from './essays';
import {
  BAND_GROUP_IDS,
  ESSAY_TASK_IDS,
  QUESTION_TYPE_IDS,
  TOPIC_IDS,
  overallBand,
} from './essayTaxonomy';
import { countWords, highlightsIn, renderInline, splitSections } from './essayMarkup';
import { TASK2_PROMPTS } from './task2Prompts';

// A minimal essay that passes every rule; each validation test breaks exactly
// one thing in it.
const ESSAY_WORDS = Array.from({ length: 260 }, (_, i) => `word${i}`).join(' ');
function fixture(overrides = {}, bodyOverrides = {}) {
  const fm = {
    title: 'Test Topic',
    task: '2',
    module: 'academic',
    topic: 'education',
    type: 'opinion',
    band: '7',
    tr: '7',
    cc: '7',
    lr: '7',
    gra: '7',
    practice: 'some-writing-question-abc123',
    date: 'September 23, 2026',
    excerpt: '"A Band 7 IELTS Task 2 opinion essay used as a loader fixture, long enough to pass the excerpt rule."',
    ...overrides,
  };
  const body = {
    Prompt: 'To what extent do you agree or disagree?',
    Essay: `${ESSAY_WORDS} ==alpha one== ==beta two== ==gamma three== ==delta four==`,
    'Task Response': 'Clear position throughout.',
    'Coherence and Cohesion': 'Logical.',
    'Lexical Resource': 'Sufficient range.',
    'Grammatical Range and Accuracy': 'Good control.',
    Vocabulary: [
      '- **alpha one** — note',
      '- **beta two** — note',
      '- **gamma three** — note',
      '- **delta four** — note',
    ].join('\n'),
    'Next band': '- first\n- second',
    ...bodyOverrides,
  };
  const frontmatter = Object.entries(fm)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const sections = Object.entries(body)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `## ${k}\n${v}\n`)
    .join('\n');
  return `---\n${frontmatter}\n---\n${sections}`;
}

describe('essay markup', () => {
  it('escapes HTML before applying markers', () => {
    expect(renderInline('<script>x</script> ==safe== **b** *i*')).toBe(
      '&lt;script&gt;x&lt;/script&gt; <mark>safe</mark> <strong>b</strong> <em>i</em>'
    );
  });

  it('counts only visible words', () => {
    expect(countWords('One ==two three== **four** — five.')).toBe(5);
  });

  it('extracts highlights and sections', () => {
    expect(highlightsIn('a ==b c== d ==e==')).toEqual(['b c', 'e']);
    expect(splitSections('## A\none\n\n## B\ntwo')).toEqual({ A: 'one', B: 'two' });
  });
});

describe('essay frontmatter validation', () => {
  it('accepts a well-formed essay', () => {
    const essay = parseEssay('test-topic-band-7.md', fixture());
    expect(essay).toMatchObject({
      slug: 'test-topic-band-7',
      bucket: 'task2-academic',
      band: 7,
      bandGroup: '7',
      seoTitle: 'IELTS Essay Bank: Test Topic Band 7 Sample Answer',
    });
    expect(essay.criteria.map((c) => c.abbr)).toEqual(['TR', 'CC', 'LR', 'GRA']);
    expect(essay.vocabulary).toHaveLength(4);
  });

  it.each([
    ['a missing title', { title: undefined }, {}, /"title" is required/],
    ['an unknown topic', { topic: 'astrology' }, {}, /unknown topic/],
    ['a Task 1 type on a Task 2 essay', { type: 'line-graph' }, {}, /does not belong/],
    ['a half-band criterion', { lr: '6.5' }, {}, /whole band/],
    ['an overall band that does not match the criteria', { band: '8' }, {}, /average to 7/],
    ['a short essay', {}, { Essay: 'Too short ==alpha one== ==beta two== ==gamma three== ==delta four==' }, /needs at least 250/],
    ['a missing criterion section', {}, { 'Lexical Resource': undefined }, /Lexical Resource/],
    ['an unhighlighted vocabulary term', {}, { Vocabulary: '- **alpha one** — n\n- **beta two** — n\n- **gamma three** — n\n- **omega** — n' }, /not ==highlighted==/],
    ['too many next-band notes', {}, { 'Next band': '- a\n- b\n- c\n- d' }, /2–3 bullet/],
    ['a "past papers" claim', { excerpt: '"Band 7 essay from real IELTS past papers, which this bank must never claim to contain at all."' }, {}, /forbidden claim/],
  ])('rejects %s', (_label, fm, body, message) => {
    expect(() => parseEssay('test-topic-band-7.md', fixture(fm, body))).toThrow(message);
  });

  it('labels Task 1 criteria as Task Achievement', () => {
    const task1 = parseEssay(
      't1-band-7.md',
      fixture(
        { task: '1', type: 'line-graph' },
        { 'Task Response': undefined, 'Task Achievement': 'Covers key features.' }
      )
    );
    expect(task1.criteria[0]).toMatchObject({ abbr: 'TA', label: 'Task Achievement' });
  });
});

describe('overall band rounding', () => {
  it('rounds the criterion mean to the nearest half band, quarters up', () => {
    expect(overallBand({ tr: 6, cc: 6, lr: 6, gra: 7 })).toBe(6.5); // 6.25
    expect(overallBand({ tr: 7, cc: 7, lr: 7, gra: 6 })).toBe(7); // 6.75
    expect(overallBand({ tr: 7, cc: 7, lr: 6, gra: 6 })).toBe(6.5);
    expect(overallBand({ tr: 8, cc: 8, lr: 8, gra: 8 })).toBe(8);
  });
});

describe('the published essay bank', () => {
  it('has at least 36 essays with unique slugs', () => {
    expect(essays.length).toBeGreaterThanOrEqual(36);
    expect(new Set(essaySlugs).size).toBe(essaySlugs.length);
  });

  it('uses only known taxonomy ids', () => {
    essays.forEach((essay) => {
      expect(ESSAY_TASK_IDS, essay.slug).toContain(essay.bucket);
      expect(QUESTION_TYPE_IDS, essay.slug).toContain(essay.type);
      expect(BAND_GROUP_IDS, essay.slug).toContain(essay.bandGroup);
      essay.topics.forEach((t) => expect(TOPIC_IDS, essay.slug).toContain(t));
    });
  });

  it('names each file after its prompt and band', () => {
    essays.forEach((essay) => {
      expect(essay.slug, essay.slug).toMatch(new RegExp(`-band-${String(essay.band).replace('.', '-')}$`));
    });
  });

  it('covers every band group and every task', () => {
    const groups = new Set(essays.map((e) => e.bandGroup));
    BAND_GROUP_IDS.forEach((id) => expect(groups.has(id), `band ${id}`).toBe(true));
    const tasks = new Set(essays.map((e) => e.bucket));
    ESSAY_TASK_IDS.forEach((id) => expect(tasks.has(id), id).toBe(true));
  });

  it('answers at least six prompts at Band 6, 7 and 8', () => {
    const byPrompt = new Map();
    essays.forEach((e) => byPrompt.set(e.practice, [...(byPrompt.get(e.practice) || []), e.bandGroup]));
    const complete = [...byPrompt.values()].filter((groups) =>
      ['6', '7', '8'].every((g) => groups.includes(g))
    );
    expect(complete.length).toBeGreaterThanOrEqual(6);
  });

  it('keeps one prompt text per practice page', () => {
    const prompts = new Map();
    essays.forEach((e) => {
      if (!prompts.has(e.practice)) prompts.set(e.practice, e.promptText);
      expect(e.promptText, `${e.slug} prompt differs from its siblings`).toBe(prompts.get(e.practice));
    });
  });

  it('links Task 2 essays to prompts that exist in the question bank', () => {
    const known = new Set(TASK2_PROMPTS.map((p) => p.slug));
    essays
      .filter((e) => e.task === 2)
      .forEach((e) => expect(known.has(e.practice), `${e.slug} -> ${e.practice}`).toBe(true));
  });

  it('finds sibling essays and relates the same prompt first', () => {
    const essay = essays[0];
    const siblings = getEssaysForPractice(essay.practice);
    expect(siblings.map((e) => e.slug)).toContain(essay.slug);
    const related = relatedEssays(essay);
    expect(related.map((e) => e.slug)).not.toContain(essay.slug);
    if (siblings.length > 1) expect(related[0].practice).toBe(essay.practice);
    expect(getEssayBySlug(essay.slug)).toBe(essay);
    expect(getEssayBySlug('nope')).toBeNull();
  });

  it('matches blog posts to relevant essays', () => {
    const letters = essaysForBlogPost({ slug: 'ielts-general-training-writing-task-1-letters', title: 'Letters' });
    expect(letters[0].bucket).toBe('task1-general');
    const discussion = essaysForBlogPost({ slug: 'ielts-writing-task-2-discuss-both-views', title: '' });
    expect(discussion[0].type).toBe('discussion');
  });
});

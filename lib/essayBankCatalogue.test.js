import { describe, expect, it } from 'vitest';
import { buildCatalogue, toCatalogueItem } from './essayBankCatalogue';
import {
  classifyLetterType,
  classifyTask1Visual,
  cleanWritingTitle,
  taskBucket,
  topicsFor,
  writingPageTitle,
} from './essayTaxonomy';

const row = (overrides = {}, details = {}) => ({
  slug: 'some-prompt-abc123',
  module: 'academic',
  title: 'IELTS Writing Task 2: Should Zoos Be Banned?',
  topic_tags: ['environment', 'society'],
  writing_details: [
    {
      task: 2,
      prompt_html:
        '<p>Some people think zoos are cruel.</p><p>To what extent do you agree or disagree?</p><p>Give reasons for your answer and include any relevant examples from your own knowledge or experience.</p>',
      model_answer_html: '<p>Zoos divide opinion.</p><p>I partly agree.</p>',
      ...details,
    },
  ],
  ...overrides,
});

describe('essay bank catalogue', () => {
  it('turns a writing row into a filterable Band 8–9 card', () => {
    expect(toCatalogueItem(row())).toEqual({
      slug: 'some-prompt-abc123',
      title: 'Should Zoos Be Banned?',
      bucket: 'task2-academic',
      topics: ['environment', 'society'],
      type: 'opinion',
      bandGroup: '8',
      summary: 'Some people think zoos are cruel. To what extent do you agree or disagree?',
      wordCount: 6,
    });
  });

  it('leaves out pages without a model answer', () => {
    expect(toCatalogueItem(row({}, { model_answer_html: null }))).toBeNull();
    expect(toCatalogueItem({ slug: 'x', writing_details: [] })).toBeNull();
  });

  it('classifies Task 1 visuals and GT letters', () => {
    const chart = toCatalogueItem(
      row(
        { title: 'Household Water Use by Region', topic_tags: [] },
        { task: 1, prompt_html: '<p>The line graph below shows water use.</p><svg><text>2020</text></svg>' }
      )
    );
    expect(chart).toMatchObject({ bucket: 'task1-academic', type: 'line-graph', topics: ['environment'] });
    expect(chart.summary).not.toMatch(/2020/); // chart SVG text never leaks into previews

    const letter = toCatalogueItem(
      row(
        { module: 'general', title: 'IELTS General Task 1: Letter to a Neighbour About Noise', topic_tags: ['general', 'community'] },
        { task: 1 }
      )
    );
    expect(letter).toMatchObject({ bucket: 'task1-general', type: 'letter-complaint', topics: ['society'] });
  });

  it('sorts Task 2 before Task 1 before letters, A–Z within a task', () => {
    const catalogue = buildCatalogue([
      row({ slug: 'l', module: 'general', title: 'Letter Inviting a Friend' }, { task: 1 }),
      row({ slug: 'b', title: 'B prompt' }),
      row({ slug: 'c', title: 'Bar chart', topic_tags: [] }, { task: 1, prompt_html: '<p>The bar chart below shows</p>' }),
      row({ slug: 'a', title: 'A prompt' }),
    ]);
    expect(catalogue.map((item) => item.slug)).toEqual(['a', 'b', 'c', 'l']);
  });
});

describe('essay taxonomy helpers', () => {
  it('buckets tasks by module', () => {
    expect(taskBucket(2, 'general')).toBe('task2-general');
    expect(taskBucket(1, null)).toBe('task1-academic');
  });

  it('maps tags to topic families with a title fallback', () => {
    expect(topicsFor({ tags: ['urbanisation', 'government'] })).toEqual(['cities', 'government']);
    expect(topicsFor({ tags: [], title: 'Animal Experimentation' })).toEqual(['science']);
    expect(topicsFor({ tags: [], title: 'Something Else Entirely' })).toEqual(['society']);
  });

  it('reads the visual type from the instruction sentence', () => {
    expect(classifyTask1Visual('X', '<p>The two pie charts below show</p>')).toBe('pie-chart');
    expect(classifyTask1Visual('X', '<p>The table below shows</p>')).toBe('table');
    expect(classifyTask1Visual('X', '<p>The two maps below show</p>')).toBe('map');
    expect(classifyTask1Visual('X', '<p>The diagram below illustrates the process</p>')).toBe('process');
    expect(classifyLetterType(['work', 'apology'], 'Letter')).toBe('letter-apology');
  });

  it('strips redundant IELTS prefixes from imported titles', () => {
    expect(cleanWritingTitle('IELTS Writing Task 2: Global English')).toBe('Global English');
    expect(cleanWritingTitle('IELTS General Task 1: Letter Inviting a Friend')).toBe('Letter Inviting a Friend');
    expect(cleanWritingTitle('Life Online')).toBe('Life Online');
  });

  it('retitles writing pages as sample essays only when a model answer exists', () => {
    expect(
      writingPageTitle({ title: 'IELTS Writing Task 2: Global English', task: 2, module: 'academic', hasModelAnswer: true })
    ).toBe('Global English – Sample Essay (Band 8–9) | IELTS Writing Task 2');
    expect(
      writingPageTitle({ title: 'Internet Users in Three Countries', task: 1, module: 'academic', hasModelAnswer: true })
    ).toBe('Internet Users in Three Countries – Sample Answer (Band 8–9) | IELTS Writing Task 1');
    expect(
      writingPageTitle({ title: 'Letter Inviting a Friend to Visit', task: 1, module: 'general', hasModelAnswer: true })
    ).toBe('Letter Inviting a Friend to Visit – Sample Letter (Band 8–9) | IELTS General Training Task 1');
    expect(writingPageTitle({ title: 'Life Online', task: 2, hasModelAnswer: false })).toBe(
      'Life Online | IELTS Writing Practice | IELTS-Bank'
    );
  });
});

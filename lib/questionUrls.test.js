import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  RETIRED_DUPLICATE_QUESTIONS,
  canonicalQuestionId,
  canonicalQuestionRedirect,
  questionPath,
  questionUrl,
  withoutRetiredDuplicates,
} from './questionUrls';
import { TASK2_PROMPTS } from './task2Prompts';

describe('question URLs', () => {
  it('uses the clean slug as the canonical id, never the legacy Firestore id', () => {
    expect(canonicalQuestionId({ slug: 'computer-games-vs-sports-7279qb', legacyId: 'Computer Games vs Sports' })).toBe(
      'computer-games-vs-sports-7279qb'
    );
    // listPassages projection: { id: slug, legacyId }
    expect(canonicalQuestionId({ id: 'coal-and-pollution-1kkkl2', legacyId: 'Coal and Pollution' })).toBe(
      'coal-and-pollution-1kkkl2'
    );
    expect(canonicalQuestionId(null)).toBe('');
  });

  it('builds www canonical paths and URLs', () => {
    expect(questionPath('reading', { id: 'endless-harvest-d60dm4', legacyId: '36OHsmd2oOOcJogXY4zB' })).toBe(
      '/readingquestion/endless-harvest-d60dm4'
    );
    expect(questionUrl('writing', { slug: 'homework-burden-d674n0' })).toBe(
      'https://www.ielts-bank.com/writingquestion/homework-burden-d674n0'
    );
    expect(questionPath('unknown', { slug: 'x' })).toBe('');
    expect(questionPath('reading', {})).toBe('');
  });

  it('points retired duplicates at their kept twin', () => {
    expect(questionPath('writing', { id: 'learning-a-language-xbqoua' })).toBe(
      '/writingquestion/learning-a-foreign-language-19xpmz'
    );
    const list = [{ id: 'learning-a-language-xbqoua' }, { id: 'learning-a-foreign-language-19xpmz' }];
    expect(withoutRetiredDuplicates('writing', list)).toEqual([{ id: 'learning-a-foreign-language-19xpmz' }]);
    // Other skills are untouched.
    expect(withoutRetiredDuplicates('reading', list)).toHaveLength(2);
  });

  it('retires only prompts whose kept twin is still published', () => {
    const published = new Set(TASK2_PROMPTS.map((p) => p.slug));
    for (const [retired, kept] of Object.entries(RETIRED_DUPLICATE_QUESTIONS.writing)) {
      expect(published.has(retired)).toBe(true);
      expect(published.has(kept)).toBe(true);
      expect(RETIRED_DUPLICATE_QUESTIONS.writing[kept]).toBeUndefined();
    }
  });
});

describe('canonicalQuestionRedirect', () => {
  const passage = { slug: 'coal-and-pollution-1kkkl2', legacyId: 'Coal and Pollution' };

  it('does not redirect the canonical slug URL', () => {
    expect(canonicalQuestionRedirect('reading', 'coal-and-pollution-1kkkl2', passage)).toBeNull();
  });

  it('permanently redirects a legacy-id URL to the slug', () => {
    expect(canonicalQuestionRedirect('reading', 'Coal and Pollution', passage)).toEqual({
      redirect: { destination: '/readingquestion/coal-and-pollution-1kkkl2', permanent: true },
    });
  });

  it('permanently redirects a retired duplicate, even via its own slug', () => {
    expect(
      canonicalQuestionRedirect('writing', 'recycling-at-home-1hqf94', { slug: 'recycling-at-home-1hqf94', legacyId: 'Recycling at Home' })
    ).toEqual({ redirect: { destination: '/writingquestion/recycling-regulation-192dud', permanent: true } });
  });

  it('never redirects when the passage is missing', () => {
    expect(canonicalQuestionRedirect('reading', 'x', null)).toBeNull();
  });
});

describe('curated Task 2 topic links', () => {
  it('only link prompts that exist in the question bank (no 404s)', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'pages/ielts-writing-task-2-topics.js'), 'utf8');
    const curated = [...source.matchAll(/\{ slug: '([^']+)', title:/g)].map((m) => m[1]);
    expect(curated.length).toBeGreaterThan(40);
    const published = new Set(TASK2_PROMPTS.map((p) => p.slug));
    expect(curated.filter((slug) => !published.has(slug))).toEqual([]);
  });
});

// @vitest-environment jsdom
// Answer-key pages: static props (redirect/404/eligibility/related links) and
// the rendered page (crawlable SSR answers inside <details>, spoiler CTA,
// one-click reveal).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const trackSpy = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({ passages: {}, rows: [], related: [] }));

vi.mock('../src/lib/analytics', () => ({ track: trackSpy }));
vi.mock('../src/components/Navbar', () => ({ default: () => null }));
vi.mock('../src/components/Footer', () => ({ default: () => null }));
vi.mock('../src/components/AdUnit', () => ({ default: () => null }));
vi.mock('../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getStructuredPassage: vi.fn(async (_skill, id) => db.passages[id] || null),
    // listAnswerKeySlugs (lib/answerKeyPages.js) runs its real eligibility
    // filter over these raw rows.
    getSupabase: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: async () => ({ data: db.rows, error: null }),
      };
      return { from: () => query };
    },
    getRelatedPractice: vi.fn(async () => db.related),
  };
});

import { toStructuredPassageShape } from '../lib/supabase';
import { answerKeyStaticPaths, answerKeyStaticProps, listAnswerKeySlugs, pickRelated } from '../lib/answerKeyPages';
import AnswerKeyPage from '../src/pages/AnswerKeyPage';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ak = (over) => ({
  accepted: [],
  correct_option_keys: [],
  spelling_variants: false,
  word_limit: null,
  normalize: 'lower_trim',
  explanation: '',
  ...over,
});

function makePassage(opts) {
  return toStructuredPassageShape(makeRow(opts));
}

function makeRow({ slug = 'why-the-body-needs-vitamins-abc', title = 'Why the Body Needs Vitamins', legacy = null } = {}) {
  return {
    id: slug,
    slug,
    legacy_firestore_id: legacy,
    skill: 'reading',
    module: 'academic',
    title,
    difficulty: 'medium',
    body_html:
      '<p>Vitamins are needed in tiny amounts. The body cannot make most of them for itself.</p><p>Vitamins do not provide energy in the way that sugars or fats do.</p>',
    question_groups: [
      {
        id: 'g1',
        position: 0,
        question_type: 'true_false_notgiven',
        prompt: 'Do the statements agree?',
        group_options: [],
        questions: [
          { id: 'q1', position: 0, prompt_text: 'The body makes most vitamins.', answer_keys: [ak({ accepted: ['false'], explanation: 'The body cannot make most of them for itself.' })] },
          { id: 'q2', position: 1, prompt_text: 'Vitamins supply little energy.', answer_keys: [ak({ accepted: ['true'], explanation: 'Vitamins do not provide energy in the way that sugars or fats do.' })] },
        ],
      },
    ],
  };
}

beforeEach(() => {
  trackSpy.mockClear();
  const vit = makePassage();
  db.passages = {
    [vit.slug]: vit,
    'legacy-id-1': vit,
    'endless-harvest-x': makePassage({ slug: 'endless-harvest-x', title: 'Endless Harvest' }),
  };
  // The denylisted title is published but must never become an answers page.
  db.rows = [vit.slug, 'a-1', 'b-2', 'c-3', 'endless-harvest-x'].map((slug) =>
    makeRow({ slug, title: slug === 'endless-harvest-x' ? 'Endless Harvest' : `Passage ${slug}` })
  );
  db.related = [
    { id: vit.slug, title: 'self' },
    { id: 'a-1', title: 'A', difficulty: 'easy' },
    { id: 'endless-harvest-x', title: 'Endless Harvest' },
    { id: 'b-2', title: 'B' },
    { id: 'c-3', title: 'C' },
  ];
});

describe('answer-key static props', () => {
  it('pre-renders only eligible slugs with blocking fallback', async () => {
    const res = await answerKeyStaticPaths('reading');
    expect(res.fallback).toBe('blocking');
    expect(res.paths[0]).toEqual({ params: { id: 'why-the-body-needs-vitamins-abc' } });
  });

  it('lists answer-key slugs server-side, dropping denylisted titles', async () => {
    const slugs = await listAnswerKeySlugs('listening-unused-cache-key');
    expect(slugs).toEqual(['why-the-body-needs-vitamins-abc', 'a-1', 'b-2', 'c-3']);
  });

  it('returns the key plus eligible related passages (never self or denylisted)', async () => {
    const res = await answerKeyStaticProps('reading', 'why-the-body-needs-vitamins-abc');
    expect(res.revalidate).toBe(3600);
    expect(res.props.answerKey.total).toBe(2);
    expect(res.props.related.map((r) => r.slug)).toEqual(['a-1', 'b-2', 'c-3']);
  });

  it('301s a legacy id to the single slug answers URL', async () => {
    const res = await answerKeyStaticProps('reading', 'legacy-id-1');
    expect(res.redirect).toEqual({
      destination: '/readingquestion/why-the-body-needs-vitamins-abc/answers',
      permanent: true,
    });
  });

  it('404s unknown and denylisted (Cambridge-colliding) passages', async () => {
    expect((await answerKeyStaticProps('reading', 'nope')).notFound).toBe(true);
    expect((await answerKeyStaticProps('reading', 'endless-harvest-x')).notFound).toBe(true);
    // A denylisted passage reached by its legacy id 404s rather than redirecting.
    db.passages['legacy-eh'] = db.passages['endless-harvest-x'];
    const viaLegacy = await answerKeyStaticProps('reading', 'legacy-eh');
    expect(viaLegacy.notFound).toBe(true);
    expect(viaLegacy.redirect).toBeUndefined();
  });
});

describe('pickRelated', () => {
  const candidates = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, title: `T${i}` }));
  const eligible = candidates.map((c) => c.id);

  it('returns up to 6 unique eligible siblings, excluding the current page', () => {
    const picked = pickRelated(candidates, 's3', eligible);
    expect(picked).toHaveLength(6);
    expect(new Set(picked.map((p) => p.slug)).size).toBe(6);
    expect(picked.map((p) => p.slug)).not.toContain('s3');
  });

  it('rotates the window per page so links spread across the bank', () => {
    const windows = new Set(['s1', 's2', 's5', 's9', 's14'].map((s) => pickRelated(candidates, s, eligible)[0].slug));
    expect(windows.size).toBeGreaterThan(1);
  });
});

describe('AnswerKeyPage', () => {
  let container;
  let root;
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
  });

  async function props() {
    return (await answerKeyStaticProps('reading', 'why-the-body-needs-vitamins-abc')).props;
  }

  it('server-renders every answer and explanation inside closed <details>', async () => {
    const html = renderToStaticMarkup(<AnswerKeyPage {...(await props())} />);
    expect(html).toContain('Why the Body Needs Vitamins: Reading Answers &amp; Explanations');
    expect(html).toContain('FALSE');
    expect(html).toContain('The body cannot make most of them for itself.');
    expect(html).toContain('Paragraph 1');
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    // Spoiler note + CTA back to the timed practice page.
    expect(html).toContain('Looking at the answers first spoils the practice');
    expect(html).toContain('href="/readingquestion/why-the-body-needs-vitamins-abc"');
    expect(html).toContain('Take this test first (timed)');
    // Related answers links + band table.
    expect(html).toContain('href="/readingquestion/a-1/answers"');
    expect(html).toContain('Estimated band score for this test');
    expect(html).toContain('original IELTS-style practice passage');
  });

  it('reveals and hides all answers with one click', async () => {
    const p = await props();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container);
      root.render(<AnswerKeyPage {...p} />);
    });
    const details = () => [...container.querySelectorAll('details[data-answer-details]')];
    expect(details().length).toBe(3); // 2 questions + quick list
    expect(details().every((d) => !d.open)).toBe(true);
    const button = [...container.querySelectorAll('button')].find((b) => /Reveal all answers/.test(b.textContent));
    act(() => button.click());
    expect(details().every((d) => d.open)).toBe(true);
    expect(trackSpy).toHaveBeenCalledWith('answers_reveal_all', expect.objectContaining({ open: true }));
    act(() => button.click());
    expect(details().every((d) => !d.open)).toBe(true);
  });
});

// The essay bank (pages/ielts-essay-bank) builds its links and counts from
// listWritingModelAnswers(); retired duplicate prompts 308 elsewhere, so they
// must never come back from it.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => [
  { slug: 'learning-a-foreign-language-19xpmz', title: 'Learning a Foreign Language' },
  { slug: 'learning-a-language-xbqoua', title: 'Learning a Language' },
  { slug: 'opportunity-of-wealth-54ayk6', title: 'Opportunity of Wealth' },
  { slug: 'recycling-at-home-1hqf94', title: 'Recycling at Home' },
  { slug: 'recycling-regulation-192dud', title: 'Recycling Regulation' },
  { slug: 'the-purpose-of-wealth-1i3c20', title: 'The Purpose of Wealth' },
]);

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    const query = {
      select: () => query,
      eq: () => query,
      order: async () => ({ data: rows, error: null }),
    };
    return { from: () => query };
  },
}));

let listWritingModelAnswers;
beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-test-key');
  vi.resetModules();
  ({ listWritingModelAnswers } = await import('./supabase'));
});
afterAll(() => vi.unstubAllEnvs());

describe('listWritingModelAnswers', () => {
  it('drops retired duplicate writing questions', async () => {
    const slugs = (await listWritingModelAnswers()).map((row) => row.slug);
    expect(slugs).toEqual([
      'learning-a-foreign-language-19xpmz',
      'recycling-regulation-192dud',
      'the-purpose-of-wealth-1i3c20',
    ]);
  });
});

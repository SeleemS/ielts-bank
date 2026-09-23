import { beforeEach, describe, expect, it, vi } from 'vitest';

const listSitemapPassages = vi.fn();
const listSpeakingHubItems = vi.fn();

vi.mock('./supabase', () => ({
  SKILLS: { reading: 'reading', writing: 'writing', listening: 'listening', speaking: 'speaking' },
  listSitemapPassages: (...args) => listSitemapPassages(...args),
}));

vi.mock('./speakingHubs', async () => {
  const actual = await vi.importActual('./speakingHubs');
  return { ...actual, listSpeakingHubItems: (...args) => listSpeakingHubItems(...args) };
});

vi.mock('./posts', () => ({
  posts: [
    { slug: 'newest-post', date: 'September 21, 2026' },
    { slug: 'revised-post', date: 'July 1, 2026', updated: 'September 1, 2026' },
  ],
}));

const { collectSitemapSection, collectAllSitemapSections } = await import('./sitemapData');
const { STATIC_ROUTES } = await import('../pages/sitemap.xml');

const NOW = new Date('2026-09-23T12:00:00Z');
const locs = (entries) => entries.map((e) => e.loc.replace('https://www.ielts-bank.com', ''));

beforeEach(() => {
  listSitemapPassages.mockReset();
  listSpeakingHubItems.mockReset();
});

describe('sitemap sections', () => {
  it('lists question pages at their slug with the row updated_at as lastmod', async () => {
    listSitemapPassages.mockResolvedValue([
      { slug: 'coal-and-pollution-1kkkl2', createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-09-02T08:00:00Z' },
      { slug: 'endless-harvest-d60dm4', createdAt: '2026-08-10T00:00:00Z', updatedAt: null },
    ]);
    const entries = await collectSitemapSection('reading', { staticRoutes: STATIC_ROUTES, now: NOW });
    const byLoc = Object.fromEntries(entries.map((e) => [e.loc.replace('https://www.ielts-bank.com', ''), e.lastmod]));
    expect(byLoc['/readingquestion/coal-and-pollution-1kkkl2']).toBe('2026-09-02');
    expect(byLoc['/readingquestion/endless-harvest-d60dm4']).toBe('2026-08-10');
    // The hub changes when a passage is added: newest created_at.
    expect(byLoc['/readingquestion']).toBe('2026-08-10');
    // Type hubs are listed without an invented date.
    expect(byLoc['/reading/matching-headings']).toBeNull();
    expect(locs(entries).every((p) => p.startsWith('/reading'))).toBe(true);
  });

  it('never stamps static pages with today', async () => {
    const entries = await collectSitemapSection('guides', { staticRoutes: STATIC_ROUTES, now: NOW });
    expect(locs(entries)).toContain('/');
    expect(locs(entries)).toContain('/ielts-writing-checker');
    expect(entries.some((e) => e.lastmod === '2026-09-23')).toBe(false);
    // Mock-test detail pages (noindex) are never listed; the hub is.
    expect(locs(entries)).toContain('/mock-test');
    expect(locs(entries).some((p) => p.startsWith('/mock/'))).toBe(false);
  });

  it('dates blog posts by updated || date and the index by the newest post', async () => {
    const entries = await collectSitemapSection('blog', { staticRoutes: STATIC_ROUTES, now: NOW });
    expect(entries).toEqual([
      { loc: 'https://www.ielts-bank.com/blog', lastmod: '2026-09-21' },
      { loc: 'https://www.ielts-bank.com/blog/newest-post', lastmod: '2026-09-21' },
      { loc: 'https://www.ielts-bank.com/blog/revised-post', lastmod: '2026-09-01' },
    ]);
  });

  it('drops thin speaking topic hubs and lists the rest with real dates', async () => {
    const card = (slug, family, createdAt) => ({ slug, family, part: 2, createdAt, updatedAt: createdAt });
    listSpeakingHubItems.mockResolvedValue([
      card('p1', 'people', '2026-07-01T00:00:00Z'),
      card('p2', 'people', '2026-09-05T00:00:00Z'),
      card('p3', 'people', '2026-08-01T00:00:00Z'),
      card('h1', 'health', '2026-09-10T00:00:00Z'),
      { slug: 'part1-set', family: 'people', part: 1, createdAt: '2026-07-02T00:00:00Z', updatedAt: null },
    ]);
    const entries = await collectSitemapSection('speaking', { staticRoutes: STATIC_ROUTES, now: NOW });
    const paths = locs(entries);
    expect(paths).toContain('/speaking/topics/people');
    expect(paths).not.toContain('/speaking/topics/health');
    expect(paths).not.toContain('/speaking/topics/nature');
    expect(paths).toContain('/speakingquestion/p1');
    expect(paths).toContain('/speakingquestion/part1-set');
    const people = entries.find((e) => e.loc.endsWith('/speaking/topics/people'));
    expect(people.lastmod).toBe('2026-09-05');
  });

  it('leaves all topic hubs out when speaking data is unavailable', async () => {
    listSpeakingHubItems.mockRejectedValue(new Error('down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const entries = await collectSitemapSection('speaking', { staticRoutes: STATIC_ROUTES, now: NOW });
    spy.mockRestore();
    expect(locs(entries).some((p) => p.startsWith('/speaking/topics/'))).toBe(false);
    expect(locs(entries)).toContain('/speaking/part-2');
  });

  it('keeps the current fallback month but drops retired duplicate prompts', async () => {
    listSitemapPassages.mockResolvedValue([
      { slug: 'homework-burden-d674n0', createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z' },
    ]);
    const entries = await collectSitemapSection('writing', { staticRoutes: STATIC_ROUTES, now: NOW });
    const paths = locs(entries);
    expect(paths).toContain('/writingquestion/homework-burden-d674n0');
    expect(paths).toContain('/ielts-writing-task-2-topics');
    expect(paths).toContain('/ielts-writing-task-2-topics/september-2026');
    expect(paths.some((p) => p.includes('%20'))).toBe(false);
  });

  it('builds every section with unique URLs across the whole sitemap', async () => {
    listSitemapPassages.mockImplementation(async (skill) => [
      { slug: `${skill}-one`, createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-02T00:00:00Z' },
    ]);
    listSpeakingHubItems.mockResolvedValue([]);
    const sections = await collectAllSitemapSections({ staticRoutes: STATIC_ROUTES, now: NOW });
    const all = Object.values(sections).flat().map((e) => e.loc);
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((loc) => loc.startsWith('https://www.ielts-bank.com/'))).toBe(true);
  });
});

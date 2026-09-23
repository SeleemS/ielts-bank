import { describe, expect, it } from 'vitest';
import {
  SITEMAP_SECTIONS,
  isoDate,
  latestDate,
  normaliseEntries,
  sitemapIndexXml,
  sitemapSectionFor,
  urlsetXml,
} from './sitemap';
import { STATIC_ROUTES } from '../pages/sitemap.xml';

describe('sitemapSectionFor', () => {
  it('routes every page type to its child sitemap', () => {
    expect(sitemapSectionFor('/blog')).toBe('blog');
    expect(sitemapSectionFor('/blog/ielts-writing-task-2-structure')).toBe('blog');
    expect(sitemapSectionFor('/readingquestion')).toBe('reading');
    expect(sitemapSectionFor('/reading/matching-headings')).toBe('reading');
    expect(sitemapSectionFor('/writingquestion/homework-burden-d674n0')).toBe('writing');
    expect(sitemapSectionFor('/ielts-writing-task-2-topics/september-2026')).toBe('writing');
    expect(sitemapSectionFor('/listening/part-1')).toBe('listening');
    expect(sitemapSectionFor('/speaking/topics/people')).toBe('speaking');
    expect(sitemapSectionFor('/speakingquestion')).toBe('speaking');
    // Tools and guides — including look-alike prefixes — are "guides".
    expect(sitemapSectionFor('/speaking-examiner')).toBe('guides');
    expect(sitemapSectionFor('/ielts-writing-checker')).toBe('guides');
    expect(sitemapSectionFor('/blogger')).toBe('guides');
    expect(sitemapSectionFor('/')).toBe('guides');
  });

  it('puts every static route in a known section', () => {
    for (const route of STATIC_ROUTES) {
      expect(SITEMAP_SECTIONS).toContain(sitemapSectionFor(route));
    }
  });
});

describe('dates', () => {
  it('parses blog-style and ISO dates, rejecting junk', () => {
    expect(isoDate('July 9, 2026')).toBe('2026-07-09');
    expect(isoDate('2026-09-02T10:11:12.000Z')).toBe('2026-09-02');
    expect(isoDate('not a date')).toBeNull();
    expect(isoDate(null)).toBeNull();
  });

  it('finds the newest date and ignores missing ones', () => {
    expect(latestDate(['2026-07-01', null, '2026-09-02T00:00:00Z', 'August 3, 2026'])).toBe('2026-09-02');
    expect(latestDate([null, undefined])).toBeNull();
  });
});

describe('normaliseEntries', () => {
  it('keeps only canonical www URLs, deduped, with the newest lastmod', () => {
    const entries = normaliseEntries(
      [
        { path: '/readingquestion', lastmod: null },
        { path: '/readingquestion', lastmod: '2026-08-01' },
        { path: '/readingquestion/', lastmod: '2026-07-01' },
        { loc: 'https://www.ielts-bank.com/blog/a', lastmod: 'July 9, 2026' },
        { loc: 'https://ielts-bank.com/blog/apex' },
        { loc: 'https://evil.example/x' },
        { path: '/' },
      ],
      { today: '2026-09-23' }
    );
    expect(entries).toEqual([
      { loc: 'https://www.ielts-bank.com/readingquestion', lastmod: '2026-08-01' },
      { loc: 'https://www.ielts-bank.com/blog/a', lastmod: '2026-07-09' },
      { loc: 'https://www.ielts-bank.com/', lastmod: null },
    ]);
  });

  it('drops excluded (noindex / redirected) paths', () => {
    const entries = normaliseEntries([{ path: '/mock/listening-mock-1' }, { path: '/mock-test' }], {
      exclude: ['/mock/listening-mock-1'],
    });
    expect(entries.map((e) => e.loc)).toEqual(['https://www.ielts-bank.com/mock-test']);
  });

  it('never emits a future lastmod and never invents one', () => {
    const [future, none] = normaliseEntries(
      [{ path: '/a', lastmod: '2030-01-01' }, { path: '/b' }],
      { today: '2026-09-23' }
    );
    expect(future.lastmod).toBe('2026-09-23');
    expect(none.lastmod).toBeNull();
  });
});

describe('XML serialisation', () => {
  it('writes a urlset, omitting unknown lastmod and escaping XML', () => {
    const xml = urlsetXml([
      { loc: "https://www.ielts-bank.com/readingquestion/a&b's", lastmod: '2026-09-01' },
      { loc: 'https://www.ielts-bank.com/about', lastmod: null },
    ]);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<loc>https://www.ielts-bank.com/readingquestion/a&amp;b&apos;s</loc><lastmod>2026-09-01</lastmod>');
    expect(xml).toContain('<url><loc>https://www.ielts-bank.com/about</loc></url>');
  });

  it('writes a sitemap index of the child sitemaps', () => {
    const xml = sitemapIndexXml([{ section: 'blog', lastmod: '2026-09-22' }, { section: 'guides' }]);
    expect(xml).toContain('<sitemapindex');
    expect(xml).toContain('<sitemap><loc>https://www.ielts-bank.com/sitemap-blog.xml</loc><lastmod>2026-09-22</lastmod></sitemap>');
    expect(xml).toContain('<sitemap><loc>https://www.ielts-bank.com/sitemap-guides.xml</loc></sitemap>');
  });
});

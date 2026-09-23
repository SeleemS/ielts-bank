import { describe, expect, it } from 'vitest';
import {
  changedSince,
  chunk,
  cleanUrlList,
  parseNameStatus,
  parseSitemap,
  routeForPageFile,
  urlsForChangedFiles,
} from './indexnowUrls.mjs';

describe('routeForPageFile', () => {
  it('maps static content pages to their public route', () => {
    expect(routeForPageFile('pages/index.js')).toBe('/');
    expect(routeForPageFile('pages/band-calculator.js')).toBe('/band-calculator');
    expect(routeForPageFile('pages/ielts-writing-checker.jsx')).toBe('/ielts-writing-checker');
    expect(routeForPageFile('pages/readingquestion/index.js')).toBe('/readingquestion');
  });

  it('skips dynamic, system and private routes', () => {
    for (const file of [
      'pages/blog/[slug].js',
      'pages/_app.js',
      'pages/api/track.js',
      'pages/dashboard.js',
      'pages/sitemap.xml.js',
      'pages/sitemap-blog.xml.js',
      'pages/auth/callback.jsx',
      'lib/site.js',
    ]) {
      expect(routeForPageFile(file), file).toBeNull();
    }
  });
});

describe('urlsForChangedFiles', () => {
  it('turns a deploy diff into the URLs that changed', () => {
    const urls = urlsForChangedFiles(
      [
        { status: 'A', path: 'content/posts/ielts-new-post.md' },
        { status: 'D', path: 'content/posts/ielts-band-score-calculation.md' },
        { status: 'M', path: 'pages/pricing.jsx' },
        { status: 'M', path: 'src/components/Footer.jsx' },
        { status: 'M', path: 'lib/task2Prompts.js' },
      ],
      { blogMerges: { 'ielts-band-score-calculation': '/band-calculator' } }
    );
    expect(urls).toEqual([
      'https://www.ielts-bank.com/band-calculator',
      'https://www.ielts-bank.com/blog',
      'https://www.ielts-bank.com/blog/ielts-band-score-calculation',
      'https://www.ielts-bank.com/blog/ielts-new-post',
      'https://www.ielts-bank.com/ielts-writing-task-2-topics',
      'https://www.ielts-bank.com/pricing',
    ]);
  });

  it('pings every merged post and its hub when the merge map changes', () => {
    const urls = urlsForChangedFiles([{ status: 'M', path: 'lib/blogMerges.json' }], {
      blogMerges: { a: '/reading/x' },
    });
    expect(urls).toEqual(['https://www.ielts-bank.com/blog/a', 'https://www.ielts-bank.com/reading/x']);
  });
});

describe('git and sitemap parsing', () => {
  it('parses git --name-status output', () => {
    expect(parseNameStatus('A\tcontent/posts/x.md\nM\tpages/about.js\n')).toEqual([
      { status: 'A', path: 'content/posts/x.md' },
      { status: 'M', path: 'pages/about.js' },
    ]);
  });

  it('reads loc/lastmod from urlsets and sitemap indexes', () => {
    const xml = `<urlset><url><loc>https://www.ielts-bank.com/a&amp;b</loc><lastmod>2026-09-20</lastmod></url>
      <url><loc>https://www.ielts-bank.com/about</loc></url></urlset>`;
    expect(parseSitemap(xml)).toEqual([
      { loc: 'https://www.ielts-bank.com/a&b', lastmod: '2026-09-20' },
      { loc: 'https://www.ielts-bank.com/about', lastmod: null },
    ]);
    const index = '<sitemapindex><sitemap><loc>https://www.ielts-bank.com/sitemap-blog.xml</loc></sitemap></sitemapindex>';
    expect(parseSitemap(index)).toEqual([{ loc: 'https://www.ielts-bank.com/sitemap-blog.xml', lastmod: null }]);
  });

  it('keeps only entries changed on/after the date, skipping undated ones', () => {
    const entries = [
      { loc: 'https://www.ielts-bank.com/new', lastmod: '2026-09-22' },
      { loc: 'https://www.ielts-bank.com/old', lastmod: '2026-08-01' },
      { loc: 'https://www.ielts-bank.com/undated', lastmod: null },
    ];
    expect(changedSince(entries, '2026-09-22')).toEqual(['https://www.ielts-bank.com/new']);
  });

  it('submits only our own origin, deduped, in batches', () => {
    expect(
      cleanUrlList(['https://www.ielts-bank.com/b', 'https://www.ielts-bank.com/a', 'https://www.ielts-bank.com/b', 'https://ielts-bank.com/x', 'https://evil.example/'])
    ).toEqual(['https://www.ielts-bank.com/a', 'https://www.ielts-bank.com/b']);
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });
});

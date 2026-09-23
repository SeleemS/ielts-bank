import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';
import { BLOG_MERGES, mergedBlogDestination, rewriteMergedBlogLinks } from './blogMerges';
import { posts } from './posts';
import { STATIC_ROUTES } from '../pages/sitemap.xml';

const require = createRequire(import.meta.url);
const nextConfig = require('../next.config.js');

describe('blog posts merged into hubs', () => {
  it('only merges into a live, indexable static route', () => {
    for (const destination of Object.values(BLOG_MERGES)) {
      expect(STATIC_ROUTES, destination).toContain(destination);
    }
  });

  it('no longer publishes a merged post', () => {
    const published = new Set(posts.map((p) => p.slug));
    for (const slug of Object.keys(BLOG_MERGES)) expect(published.has(slug), slug).toBe(false);
  });

  it('leaves the essay-bank posts to the /ielts-essay-bank work', () => {
    expect(mergedBlogDestination('ielts-essay-bank-guide')).toBeNull();
    expect(mergedBlogDestination('ielts-writing-bank-tips')).toBeNull();
  });

  it('permanently redirects every merged slug in next.config.js', async () => {
    const redirects = await nextConfig.redirects();
    for (const [slug, destination] of Object.entries(BLOG_MERGES)) {
      expect(redirects).toContainEqual({ source: `/blog/${slug}`, destination, permanent: true });
    }
    expect(redirects).toContainEqual({ source: '/index', destination: '/', permanent: true });
  });

  it('never merges a post into another blog URL (no redirect chains)', () => {
    for (const destination of Object.values(BLOG_MERGES)) expect(destination.startsWith('/blog')).toBe(false);
  });
});

describe('rewriteMergedBlogLinks', () => {
  it('points links to merged posts straight at the hub', () => {
    const html =
      '<a href="/blog/ielts-band-score-calculation">calc</a> ' +
      '<a href="https://www.ielts-bank.com/blog/ielts-speaking-part-2-cue-card/#tips">cue</a> ' +
      '<a href="https://ielts-bank.com/blog/ielts-reading-true-false-not-given">tfng</a>';
    expect(rewriteMergedBlogLinks(html)).toBe(
      '<a href="/band-calculator">calc</a> <a href="/speaking/part-2">cue</a> <a href="/reading/true-false-not-given">tfng</a>'
    );
  });

  it('leaves every other link untouched', () => {
    const html = '<a href="/blog/ielts-writing-task-2-structure">x</a> <a href="/readingquestion">y</a>';
    expect(rewriteMergedBlogLinks(html)).toBe(html);
    expect(rewriteMergedBlogLinks('')).toBe('');
  });

  it('leaves no live post linking to a merged slug once rendered', () => {
    const pattern = new RegExp(`/blog/(${Object.keys(BLOG_MERGES).join('|')})["/#]`);
    for (const post of posts) {
      expect(pattern.test(rewriteMergedBlogLinks(post.content)), post.slug).toBe(false);
    }
  });
});

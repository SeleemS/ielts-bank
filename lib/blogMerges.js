// lib/blogMerges.js
// Blog posts that duplicated a hub page and were merged into it (Sep 2026,
// docs/growth-2026-09-23/10-SEO-STRATEGY.md §B3). Each slug 308-redirects to
// its hub (next.config.js reads lib/blogMerges.json), and links to it inside
// other posts are rewritten at render time so no internal link lands on a
// redirect. The post bodies themselves stay byte-identical to their source
// files (lib/posts.test.js guards that).

import BLOG_MERGES from './blogMerges.json';

export { BLOG_MERGES };

export function mergedBlogDestination(slug) {
  return Object.prototype.hasOwnProperty.call(BLOG_MERGES, slug) ? BLOG_MERGES[slug] : null;
}

// Rewrites href="/blog/<merged-slug>" (relative or absolute, any host
// variant, optional trailing slash / #fragment) to the hub it merged into.
const BLOG_HREF = /href="(?:https?:\/\/(?:www\.)?ielts-bank\.com)?\/blog\/([a-z0-9-]+)\/?(?:#[^"]*)?"/g;

export function rewriteMergedBlogLinks(html) {
  if (!html) return html;
  return String(html).replace(BLOG_HREF, (match, slug) => {
    const destination = mergedBlogDestination(slug);
    return destination ? `href="${destination}"` : match;
  });
}

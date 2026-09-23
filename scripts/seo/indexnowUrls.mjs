// scripts/seo/indexnowUrls.mjs
// Pure helpers for scripts/seo/indexnow-submit.mjs: work out WHICH URLs
// changed in a deploy, from two sources —
//   1. the git diff of the deploy (blog posts, static pages, redirects), and
//   2. the live sitemap's <lastmod> (database content: new or edited
//      passages, which never appear in git).
// No network or git access here, so it is unit-tested directly.

export const SITE = 'https://www.ielts-bank.com';

const PAGE_EXT = /\.(jsx?|tsx?)$/;
// Pages that are not public content URLs.
const NON_CONTENT_PAGES = /^(?:_app|_document|_error|404|500|api\/.*|auth\/.*|billing\/.*|dashboard|data|review|r|sitemap.*)$/;

// A pages/ file path -> its public route, or null for dynamic / non-content
// routes (dynamic routes are covered by the sitemap-lastmod source).
export function routeForPageFile(file) {
  const match = /^pages\/(.+)$/.exec(file);
  if (!match || !PAGE_EXT.test(match[1])) return null;
  let route = match[1].replace(PAGE_EXT, '');
  if (route.includes('[')) return null;
  if (NON_CONTENT_PAGES.test(route)) return null;
  if (route === 'index') return '/';
  route = route.replace(/\/index$/, '');
  return `/${route}`;
}

// files: [{ status: 'A'|'M'|'D'|'R', path }] from `git diff --name-status`.
// blogMerges: the slug -> destination map (lib/blogMerges.json), so a merged
// post pings both its old URL (now a redirect) and the hub it moved to.
export function urlsForChangedFiles(files = [], { blogMerges = {} } = {}) {
  const paths = new Set();
  for (const { path } of files) {
    const post = /^content\/posts\/([a-z0-9-]+)\.md$/.exec(path || '');
    if (post) {
      paths.add(`/blog/${post[1]}`);
      paths.add('/blog');
      if (blogMerges[post[1]]) paths.add(blogMerges[post[1]]);
      continue;
    }
    if (path === 'lib/blogMerges.json') {
      for (const [slug, destination] of Object.entries(blogMerges)) {
        paths.add(`/blog/${slug}`);
        paths.add(destination);
      }
      continue;
    }
    if (path === 'lib/task2Prompts.js') {
      paths.add('/ielts-writing-task-2-topics');
      continue;
    }
    const route = routeForPageFile(path || '');
    if (route) paths.add(route);
  }
  return [...paths].sort().map((p) => `${SITE}${p}`);
}

// Parse `git diff --name-status` output (renames report the NEW path).
export function parseNameStatus(output = '') {
  return String(output)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t+/);
      return { status: parts[0][0], path: parts[parts.length - 1] };
    });
}

// <loc>/<lastmod> pairs from a urlset or sitemapindex document.
export function parseSitemap(xml = '') {
  const blocks = String(xml).match(/<(url|sitemap)>[\s\S]*?<\/\1>/g) || [];
  return blocks.map((block) => ({
    loc: (/<loc>([^<]+)<\/loc>/.exec(block) || [])[1]?.trim().replace(/&amp;/g, '&').replace(/&apos;/g, "'") || null,
    lastmod: (/<lastmod>([^<]+)<\/lastmod>/.exec(block) || [])[1]?.trim() || null,
  })).filter((entry) => entry.loc);
}

// Entries whose lastmod is on/after `since` (YYYY-MM-DD). Entries without a
// lastmod are skipped: we only ping what we KNOW changed.
export function changedSince(entries = [], since) {
  if (!since) return entries.map((e) => e.loc);
  return entries.filter((e) => e.lastmod && e.lastmod.slice(0, 10) >= since).map((e) => e.loc);
}

// Only our own origin, deduped, in stable order.
export function cleanUrlList(urls = []) {
  return [...new Set(urls.filter((u) => typeof u === 'string' && u.startsWith(`${SITE}/`)))].sort();
}

// IndexNow accepts up to 10,000 URLs per POST.
export function chunk(list, size = 10000) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

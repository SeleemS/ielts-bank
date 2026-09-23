#!/usr/bin/env node
/**
 * scripts/seo/indexnow-submit.mjs
 * --------------------------------
 * Ping IndexNow (Bing, Copilot, Yandex, Naver, Seznam — Google does not use
 * IndexNow) with the URLs that CHANGED in a deploy, instead of the whole site.
 *
 * Sources (combined, deduped, www-only):
 *   --git-range A..B     files changed between two commits -> URLs
 *                        (blog posts, static pages, blog-merge redirects)
 *   --since YYYY-MM-DD   sitemap URLs whose <lastmod> is on/after the date
 *                        (database content: new/edited passages). Also
 *                        accepts "yesterday" / "today".
 *   /path ...            explicit paths or URLs
 *   --all                every URL in the sitemap (use sparingly)
 *   --dry-run            print, do not submit
 *
 * Default with no source flags: --git-range HEAD~1..HEAD --since yesterday.
 *
 * Runs automatically after each successful Production deploy via
 * .github/workflows/indexnow.yml; run by hand after a bulk content change:
 *   node scripts/seo/indexnow-submit.mjs --since 2026-09-01 --dry-run
 *
 * The key is public by design (proved by hosting public/<key>.txt).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  SITE,
  changedSince,
  chunk,
  cleanUrlList,
  parseNameStatus,
  parseSitemap,
  urlsForChangedFiles,
} from './indexnowUrls.mjs';

const KEY = '01984fdbff8e84fd2dcbf3a29275d300';

function parseArgs(argv) {
  const opts = { gitRange: null, since: null, all: false, dryRun: false, paths: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--all') opts.all = true;
    else if (arg === '--git-range') opts.gitRange = argv[++i];
    else if (arg === '--since') opts.since = argv[++i];
    else opts.paths.push(arg);
  }
  if (!opts.gitRange && !opts.since && !opts.all && !opts.paths.length) {
    opts.gitRange = 'HEAD~1..HEAD';
    opts.since = 'yesterday';
  }
  return opts;
}

function resolveDate(value) {
  if (!value) return null;
  const day = 24 * 60 * 60 * 1000;
  if (value === 'today') return new Date().toISOString().slice(0, 10);
  if (value === 'yesterday') return new Date(Date.now() - day).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`--since expects YYYY-MM-DD, got "${value}"`);
  return value;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'ielts-bank-indexnow/1.0' } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

// Every <url> entry across the sitemap index and its children.
async function sitemapEntries() {
  const index = parseSitemap(await fetchText(`${SITE}/sitemap.xml`));
  const children = index.filter((entry) => /\/sitemap-[a-z]+\.xml$/.test(entry.loc));
  if (!children.length) return index; // plain urlset (pre-index deploys)
  const lists = await Promise.all(children.map(async (child) => parseSitemap(await fetchText(child.loc))));
  return lists.flat();
}

function gitChangedUrls(range) {
  const output = execFileSync('git', ['diff', '--name-status', '--no-renames', range], { encoding: 'utf8' });
  const blogMerges = JSON.parse(readFileSync(new URL('../../lib/blogMerges.json', import.meta.url), 'utf8'));
  return urlsForChangedFiles(parseNameStatus(output), { blogMerges });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const urls = opts.paths.map((p) => (p.startsWith('http') ? p : `${SITE}${p.startsWith('/') ? '' : '/'}${p}`));

  if (opts.gitRange) {
    try {
      urls.push(...gitChangedUrls(opts.gitRange));
    } catch (error) {
      console.warn(`[indexnow] git range ${opts.gitRange} unavailable: ${error.message.split('\n')[0]}`);
    }
  }
  if (opts.since || opts.all) {
    const entries = await sitemapEntries();
    urls.push(...(opts.all ? entries.map((e) => e.loc) : changedSince(entries, resolveDate(opts.since))));
  }

  const urlList = cleanUrlList(urls);
  console.log(`[indexnow] ${urlList.length} changed URL(s)${opts.dryRun ? ' (dry run)' : ''}`);
  urlList.slice(0, 50).forEach((u) => console.log(`  ${u}`));
  if (urlList.length > 50) console.log(`  … +${urlList.length - 50} more`);
  if (!urlList.length || opts.dryRun) return;

  for (const batch of chunk(urlList)) {
    const response = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: batch }),
    });
    // 200 = submitted, 202 = accepted (key validation pending) — both fine.
    console.log(`[indexnow] response: ${response.status} ${response.statusText}`);
    if (response.status >= 400) {
      console.error(await response.text());
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error('[indexnow] fatal:', error.message);
  process.exit(1);
});

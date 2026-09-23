// lib/sitemap.js
// Pure helpers for the sitemap index (/sitemap.xml) and its per-type child
// sitemaps (/sitemap-<section>.xml). No I/O here — lib/sitemapData.js gathers
// the entries, this module classifies, filters and serialises them.
//
// Rules (Sep 2026 tech-SEO pass, docs/growth-2026-09-23/30-TECH-SEO-CHANGES.md):
//   * only canonical, indexable, www URLs; one entry per URL
//   * <lastmod> only when we know a REAL content date — never "now"; an absent
//     lastmod is honest, a fake one teaches Google to ignore the field
//   * one child sitemap per page type, so GSC reports indexing per type

import { SITE_URL } from './site';

export const SITEMAP_SECTIONS = ['guides', 'blog', 'reading', 'writing', 'listening', 'speaking'];

export function sitemapPath(section) {
  return `/sitemap-${section}.xml`;
}

// Which child sitemap a site-relative path belongs to. Anything that is not a
// blog post or a skill page (tools, guides, legal, pricing, …) is a "guide".
export function sitemapSectionFor(path) {
  const p = String(path || '');
  if (/^\/blog(\/|$)/.test(p)) return 'blog';
  if (/^\/(readingquestion|reading)(\/|$)/.test(p)) return 'reading';
  if (/^\/(writingquestion|ielts-writing-task-2-topics|ielts-essay-bank)(\/|$)/.test(p)) return 'writing';
  if (/^\/(listeningquestion|listening)(\/|$)/.test(p)) return 'listening';
  if (/^\/(speakingquestion|speaking)(\/|$)/.test(p)) return 'speaking';
  return 'guides';
}

// ISO date (YYYY-MM-DD) or null. Accepts Date objects, ISO timestamps and
// human-readable blog dates ("July 9, 2026").
export function isoDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Newest ISO date among the values (nulls ignored), or null.
export function latestDate(values = []) {
  const dates = values.map(isoDate).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

// Normalise raw entries ({ path | loc, lastmod? }) into a clean list:
//   * absolute www URL, no trailing slash (except the home page)
//   * paths in `exclude` (noindex / redirected) dropped
//   * duplicates merged, keeping the newest lastmod
//   * lastmod clamped to `today` so a clock skew never claims a future edit
export function normaliseEntries(entries = [], { exclude = [], today = null } = {}) {
  const excluded = new Set(exclude);
  const byLoc = new Map();
  for (const entry of entries) {
    if (!entry) continue;
    let path = entry.path ?? String(entry.loc || '').replace(SITE_URL, '');
    if (!path.startsWith('/')) continue; // foreign origin or garbage
    if (path.length > 1) path = path.replace(/\/+$/, '');
    if (excluded.has(path)) continue;
    let lastmod = isoDate(entry.lastmod);
    if (lastmod && today && lastmod > today) lastmod = today;
    const loc = `${SITE_URL}${path}`;
    const prev = byLoc.get(loc);
    if (!prev) byLoc.set(loc, { loc, lastmod });
    else if (lastmod && (!prev.lastmod || lastmod > prev.lastmod)) prev.lastmod = lastmod;
  }
  return [...byLoc.values()];
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function urlsetXml(entries = []) {
  const rows = entries.map((e) => {
    const parts = [`<loc>${escapeXml(e.loc)}</loc>`];
    if (e.lastmod) parts.push(`<lastmod>${e.lastmod}</lastmod>`);
    return `  <url>${parts.join('')}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows.join('\n')}
</urlset>`;
}

// sitemaps: [{ section, lastmod? }]
export function sitemapIndexXml(sitemaps = []) {
  const rows = sitemaps.map(({ section, lastmod }) => {
    const parts = [`<loc>${SITE_URL}${sitemapPath(section)}</loc>`];
    if (lastmod) parts.push(`<lastmod>${lastmod}</lastmod>`);
    return `  <sitemap>${parts.join('')}</sitemap>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows.join('\n')}
</sitemapindex>`;
}

// Sitemaps are fetched by crawlers only; an hour at the edge keeps Googlebot
// from hitting Supabase on every fetch while new content still shows up fast.
export const SITEMAP_CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400';

export function sendXml(res, xml) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', SITEMAP_CACHE_CONTROL);
  res.write(xml);
  res.end();
}

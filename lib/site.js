// lib/site.js
// The ONE canonical public origin, imported by every page that builds
// canonical URLs, OG tags, JSON-LD or the sitemap.
//
// The site SERVES on www — the apex 307-redirects to www (Vercel domain
// config). Canonicals/sitemap previously pointed at the apex, which meant
// every indexing signal pointed at a redirect. If the primary domain ever
// changes in Vercel, update this constant and nothing else.
export const SITE_URL = 'https://www.ielts-bank.com';

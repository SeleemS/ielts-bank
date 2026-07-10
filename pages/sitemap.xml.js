import { posts } from '../lib/posts';
import { SKILLS, listPassages } from '../lib/supabase';

const SITE_URL = 'https://ielts-bank.com';

const STATIC_ROUTES = [
  '/',
  '/contactus',
  '/privacypolicy',
  '/termsofservice',
  '/blog',
  '/readingquestion',
  '/writingquestion',
  '/listeningquestion',
  '/speakingquestion',
];

// Build an ISO date (YYYY-MM-DD) or null. Accepts human-readable strings like
// "July 9, 2026" (blog post dates) as well as Date objects.
function isoDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function urlEntry(loc, lastmod) {
  const parts = [`<loc>${loc}</loc>`];
  if (lastmod) parts.push(`<lastmod>${lastmod}</lastmod>`);
  return `  <url>${parts.join('')}</url>`;
}

export async function getServerSideProps({ res }) {
  const entries = [];
  const today = isoDate(new Date());

  STATIC_ROUTES.forEach((route) =>
    entries.push({ loc: `${SITE_URL}${route}`, lastmod: today })
  );

  posts.forEach((post) =>
    entries.push({
      loc: `${SITE_URL}/blog/${post.slug}`,
      lastmod: isoDate(post.date),
    })
  );

  const sections = [
    { path: 'readingquestion', skill: SKILLS.reading },
    { path: 'writingquestion', skill: SKILLS.writing },
    { path: 'listeningquestion', skill: SKILLS.listening },
    { path: 'speakingquestion', skill: SKILLS.speaking },
  ];

  await Promise.all(
    sections.map(async ({ path, skill }) => {
      try {
        // Enumerate EVERY published passage for the skill. listPassages returns
        // { id: slug, legacyId, title, difficulty }. Prefer the legacy-id URL
        // when a legacy Firestore id exists (those URLs are already indexed);
        // otherwise use the slug URL. This includes the newer AI-authored
        // passages that have a slug but no legacy id, which the old
        // getLegacyIdSlugMap() enumeration missed entirely.
        const passages = await listPassages(skill);
        passages.forEach((p) => {
          const routeId = p.legacyId || p.id; // p.id is the slug
          if (!routeId) return;
          entries.push({
            loc: `${SITE_URL}/${path}/${encodeURIComponent(routeId)}`,
          });
        });
      } catch (err) {
        // If Supabase is unreachable, still emit the static + blog URLs.
        console.error(`Sitemap: failed to enumerate ${skill}`, err);
      }
    })
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => urlEntry(e.loc, e.lastmod)).join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  res.write(xml);
  res.end();

  return { props: {} };
}

export default function Sitemap() {
  return null;
}

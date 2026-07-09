import { posts } from '../lib/posts';
import { SKILLS, getLegacyIdSlugMap } from '../lib/supabase';

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
];

function urlEntry(loc) {
  return `  <url><loc>${loc}</loc></url>`;
}

export async function getServerSideProps({ res }) {
  const urls = [];

  STATIC_ROUTES.forEach((route) => urls.push(`${SITE_URL}${route}`));

  posts.forEach((post) => urls.push(`${SITE_URL}/blog/${post.slug}`));

  const sections = [
    { path: 'readingquestion', skill: SKILLS.reading },
    { path: 'writingquestion', skill: SKILLS.writing },
    { path: 'listeningquestion', skill: SKILLS.listening },
  ];

  await Promise.all(
    sections.map(async ({ path, skill }) => {
      try {
        // Keys of the legacy-id -> slug map are the legacy Firestore ids used
        // as the public (SEO-indexed) URLs today; keep emitting those.
        const legacyMap = await getLegacyIdSlugMap(skill);
        Object.keys(legacyMap).forEach((id) =>
          urls.push(`${SITE_URL}/${path}/${encodeURIComponent(id)}`)
        );
      } catch (err) {
        // If Supabase is unreachable, still emit the static + blog URLs.
        console.error(`Sitemap: failed to enumerate ${skill}`, err);
      }
    })
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(urlEntry).join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  res.write(xml);
  res.end();

  return { props: {} };
}

export default function Sitemap() {
  return null;
}

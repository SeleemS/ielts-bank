import { SITE_URL } from './site';

export const MOCK_INDEX_SEO = Object.freeze({
  title: 'IELTS Mock Tests | IELTS-Bank',
  description:
    'Take a full-length IELTS Reading or Listening mock test with a real timer, instant scoring, a per-section breakdown and an estimated band. Included with Premium.',
  canonical: `${SITE_URL}/mock-test`,
  ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent(
    'Full-length IELTS mock tests'
  )}&type=mock`,
  imageAlt: 'Full-length IELTS Reading and Listening mock tests — IELTS-Bank',
});

export function getMockSeo(mock) {
  const title = `${mock.title} | IELTS-Bank`;
  const description = mock.description;
  const canonical = `${SITE_URL}/mock/${encodeURIComponent(mock.slug)}`;
  const skill = mock.skill
    ? `${mock.skill.charAt(0).toUpperCase()}${mock.skill.slice(1)}`
    : 'IELTS';

  return {
    title,
    description,
    canonical,
    ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent(
      mock.title
    )}&type=mock&subtitle=${encodeURIComponent(skill)}`,
    imageAlt: `${mock.title} — IELTS-Bank`,
  };
}

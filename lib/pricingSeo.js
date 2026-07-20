import { SITE_URL } from './site';

const title = 'IELTS Bank Premium – AI Feedback, Examiner & Mock Tests';
const description =
  'IELTS Bank Pro unlocks full AI Writing feedback, Speaking scoring, live examiner practice, and timed mock tests — billed monthly or every 6 months. Summer Sale on now, with a 14-day money-back guarantee.';

export const PRICING_SEO = {
  title,
  description,
  canonical: `${SITE_URL}/pricing`,
  ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent(
    'Know exactly what is holding your IELTS band back'
  )}&type=pricing&subtitle=Premium`,
  imageAlt: 'IELTS Bank Premium plans with AI feedback, examiner practice, and mock tests',
};

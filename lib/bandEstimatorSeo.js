import { SITE_URL } from './site';

const title = 'Free IELTS Band Estimator — 15-Minute Level Test | IELTS-Bank';
const description =
  '15-minute IELTS estimate with real Reading and Listening questions, a marked Writing sample, and Speaking self-check. Free to start; sign up to reveal Writing.';

export const BAND_ESTIMATOR_SEO = {
  title,
  description,
  canonical: `${SITE_URL}/band-estimator`,
  ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent(
    'What is your IELTS band?'
  )}&type=estimator&subtitle=${encodeURIComponent('Free 15-minute level test')}`,
  imageAlt: 'Free 15-minute IELTS band estimator covering all four skills',
};

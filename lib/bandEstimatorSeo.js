import { SITE_URL } from './site';

const title = 'Free IELTS Band Estimator — 15-Minute Level Test | IELTS-Bank';
const description =
  'Find out your IELTS band in about 15 minutes. Answer real Reading and Listening questions, self-check your Writing and Speaking, and get an honest band estimate with a clear next step. Free, no sign-up.';

export const BAND_ESTIMATOR_SEO = {
  title,
  description,
  canonical: `${SITE_URL}/band-estimator`,
  ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent(
    'What is your IELTS band?'
  )}&type=estimator&subtitle=${encodeURIComponent('Free 15-minute level test')}`,
  imageAlt: 'Free 15-minute IELTS band estimator covering all four skills',
};

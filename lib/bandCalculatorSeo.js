import { SITE_URL } from './site';

const title = 'IELTS Band Score Calculator – Listening, Reading & Overall Band';
const description =
  'Free IELTS band score calculator. Convert your Listening and Reading raw scores to band scores, add Writing and Speaking, and get your estimated overall band with the official rounding rule.';

export const BAND_CALCULATOR_SEO = {
  title,
  description,
  canonical: `${SITE_URL}/band-calculator`,
  ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent(
    'Calculate your IELTS band score'
  )}&type=calculator&subtitle=Free Tool`,
  imageAlt: 'Free IELTS band score calculator for all four skills',
};

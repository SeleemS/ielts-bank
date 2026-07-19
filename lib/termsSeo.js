import { SITE_URL } from './site';

const title = 'Terms of Service | IELTS-Bank';
const description =
  'Read the IELTS-Bank terms for free practice, Premium plans, the Exam Pass, cancellations, and the 14-day refund policy.';

export const TERMS_SEO = {
  title,
  description,
  canonical: `${SITE_URL}/termsofservice`,
  ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent(
    'IELTS-Bank service and billing terms'
  )}&type=legal&subtitle=Terms`,
  imageAlt: 'IELTS-Bank Terms of Service, billing, cancellation, and refund information',
};

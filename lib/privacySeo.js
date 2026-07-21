import { SITE_URL } from './site';

export const PRIVACY_LAST_UPDATED = 'July 21, 2026';

const title = 'Privacy Policy | IELTS-Bank';
const description =
  'Privacy Policy for IELTS-Bank.com — how we collect, use, and protect your data, including cookies, advertising, and your rights under GDPR and CCPA.';

export const PRIVACY_SEO = {
  title,
  description,
  canonical: `${SITE_URL}/privacypolicy`,
  ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent(
    'How IELTS-Bank protects your data'
  )}&type=legal&subtitle=Privacy`,
  imageAlt: 'IELTS-Bank Privacy Policy and data protection information',
};

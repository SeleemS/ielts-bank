import { SITE_URL } from './site';

const title = 'About Us | IELTS-Bank';
const description =
  'Learn about IELTS-Bank — free IELTS practice content plus optional Premium AI feedback, mock tests and study guides.';

export const ABOUT_SEO = {
  title,
  description,
  canonical: `${SITE_URL}/about`,
  ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent(
    'Accessible IELTS preparation for everyone'
  )}&type=about&subtitle=Our Mission`,
  imageAlt: 'About IELTS-Bank and our mission for accessible IELTS preparation',
};

import { SITE_URL } from './site';

const title = 'Live AI IELTS Speaking Examiner on gpt-live-1';
const description =
  'Sit a full IELTS Speaking mock with a live AI examiner on the newly released gpt-live-1: Part 1 through Part 3, it listens while it speaks, then bands you.';

export const SPEAKING_EXAMINER_SEO = {
  title,
  description,
  canonical: `${SITE_URL}/speaking-examiner`,
  ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent(
    'A live IELTS Speaking interview on gpt-live-1'
  )}&type=examiner&subtitle=${encodeURIComponent('Live AI examiner · full-duplex')}`,
  imageAlt: 'Live AI IELTS Speaking examiner mock interview on gpt-live-1',
};

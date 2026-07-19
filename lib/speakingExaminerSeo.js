import { SITE_URL } from './site';

const title = 'Live AI IELTS Speaking Examiner – Real Mock Interview';
const description =
  'Take a live IELTS Speaking mock interview with an AI examiner: adaptive Part 1 questions, a timed Part 2 cue card, probing Part 3 follow-ups, and a band score with feedback at the end.';

export const SPEAKING_EXAMINER_SEO = {
  title,
  description,
  canonical: `${SITE_URL}/speaking-examiner`,
  ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent(
    'Practise a real IELTS Speaking interview'
  )}&type=examiner&subtitle=Live AI`,
  imageAlt: 'Live AI IELTS Speaking examiner mock interview',
};

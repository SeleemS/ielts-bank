import { SITE_URL } from './site';

const title = 'IELTS Writing Checker – Try Your First AI Band Score Free';
const description =
  'Try your first AI IELTS Writing score free. See your estimated overall band and one criterion, then unlock the complete examiner-style feedback with Premium.';

export const WRITING_CHECKER_SEO = {
  title,
  description,
  canonical: `${SITE_URL}/ielts-writing-checker`,
  ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent(
    'Check your IELTS Writing band'
  )}&type=writing&subtitle=Free AI Score`,
  imageAlt: 'IELTS Writing Checker with a free AI band score',
};

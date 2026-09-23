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

// The task-specific landing pages (pages/ielts-writing-checker/[task].jsx).
// Kept here — tiny and browser-safe — because the main checker page renders
// this list; the long per-task page content lives in lib/writingCheckerTasks.js
// and is only read inside getStaticProps.
export const WRITING_CHECKER_TASK_LINKS = [
  {
    slug: 'task-2',
    href: '/ielts-writing-checker/task-2',
    label: 'Task 2 essay checker',
    blurb: 'Opinion, discussion, advantages and problem-solution essays, marked on Task Response.',
  },
  {
    slug: 'task-1',
    href: '/ielts-writing-checker/task-1',
    label: 'Task 1 Academic report checker',
    blurb: 'Graphs, charts, tables, maps and processes, marked on Task Achievement and your overview.',
  },
  {
    slug: 'general-training-letter',
    href: '/ielts-writing-checker/general-training-letter',
    label: 'General Training letter checker',
    blurb: 'Formal, semi-formal and informal letters, marked on purpose, bullet coverage and tone.',
  },
];

const PUBLISHER = { '@type': 'Organization', '@id': `${SITE_URL}/#organization`, name: 'IELTS-Bank', url: SITE_URL };
const FREE_SAMPLE_OFFER = {
  '@type': 'Offer',
  price: '0',
  priceCurrency: 'USD',
  description: 'One free AI Writing report per account; the full report is part of Premium.',
};

// WebApplication (a SoftwareApplication subtype) describing a checker page as
// a tool. Only facts that are visible on the page: the free offer is the one
// sample report per account. No rating is included — we have no genuine
// aggregate rating to publish.
export function buildCheckerAppJsonLd({ path, name, description: appDescription, featureList }) {
  const url = `${SITE_URL}${path}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': `${url}#app`,
    name,
    url,
    description: appDescription,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Any (web browser)',
    inLanguage: 'en',
    isAccessibleForFree: true,
    featureList,
    offers: FREE_SAMPLE_OFFER,
    publisher: PUBLISHER,
  };
}

// The main checker's WebApplication, alongside the page's FAQPage.
export function buildWritingCheckerAppJsonLd() {
  return buildCheckerAppJsonLd({
    path: '/ielts-writing-checker',
    name: 'IELTS-Bank AI Writing Checker',
    description,
    featureList: [
      'Estimated IELTS Writing band score for Task 1 and Task 2',
      'Feedback on Task Response, Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy',
      'Corrected sentences from your own essay',
    ],
  });
}

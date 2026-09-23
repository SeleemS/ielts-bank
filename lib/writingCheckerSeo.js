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

// WebApplication (a SoftwareApplication subtype) describing the checker as a
// tool, alongside the page's FAQPage. Only facts that are visible on the page:
// the free offer is the one lifetime sample report per account. No rating is
// included — we have no genuine aggregate rating to publish.
export function buildWritingCheckerAppJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': `${SITE_URL}/ielts-writing-checker#app`,
    name: 'IELTS-Bank AI Writing Checker',
    url: `${SITE_URL}/ielts-writing-checker`,
    description,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Any (web browser)',
    inLanguage: 'en',
    isAccessibleForFree: true,
    featureList: [
      'Estimated IELTS Writing band score for Task 1 and Task 2',
      'Feedback on Task Response, Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy',
      'Corrected sentences from your own essay',
    ],
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'One free AI Writing report per account; the full report is part of Premium.',
    },
    publisher: { '@type': 'Organization', '@id': `${SITE_URL}/#organization`, name: 'IELTS-Bank', url: SITE_URL },
  };
}

import { SITE_URL } from './site';

export function buildWritingQuestionJsonLd({
  canonicalUrl,
  title,
  description,
  task,
  difficulty,
}) {
  const name = title || 'IELTS Writing Practice';
  const sectionUrl = `${SITE_URL}/writingquestion`;
  const taskNumber = task === 1 ? 1 : 2;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'LearningResource',
        '@id': `${canonicalUrl}#resource`,
        name,
        description,
        url: canonicalUrl,
        learningResourceType: `IELTS Writing Task ${taskNumber} practice question`,
        educationalUse: 'IELTS exam preparation',
        educationalLevel: difficulty || 'Intermediate to Advanced',
        inLanguage: 'en',
        isAccessibleForFree: true,
        timeRequired: taskNumber === 1 ? 'PT20M' : 'PT40M',
        teaches: `IELTS Writing Task ${taskNumber} response, coherence, vocabulary and grammar`,
        about: { '@type': 'Thing', name: 'IELTS Writing' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'IELTS Writing',
            item: sectionUrl,
          },
          { '@type': 'ListItem', position: 3, name, item: canonicalUrl },
        ],
      },
    ],
  };
}

export function serializeJsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

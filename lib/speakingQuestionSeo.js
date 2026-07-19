import { SITE_URL } from './site';

export function buildSpeakingQuestionJsonLd({
  canonicalUrl,
  topic,
  description,
  partLabel,
  difficulty,
}) {
  const name = topic || 'IELTS Speaking Practice';
  const sectionUrl = `${SITE_URL}/speakingquestion`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'LearningResource',
        '@id': `${canonicalUrl}#resource`,
        name,
        description,
        url: canonicalUrl,
        learningResourceType: `IELTS Speaking ${partLabel} practice question`,
        educationalUse: 'IELTS exam preparation',
        educationalLevel: difficulty || 'Intermediate to Advanced',
        inLanguage: 'en',
        isAccessibleForFree: true,
        teaches: 'IELTS Speaking fluency, vocabulary, grammar and pronunciation',
        about: { '@type': 'Thing', name: 'IELTS Speaking' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'IELTS Speaking',
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

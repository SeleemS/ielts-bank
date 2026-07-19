import { SITE_URL } from './site';

function skillLabel(skill) {
  return skill
    ? `${skill.charAt(0).toUpperCase()}${skill.slice(1)}`
    : 'IELTS';
}

function duration(seconds) {
  const minutes = Math.max(1, Math.round(Number(seconds || 0) / 60));
  return `PT${minutes}M`;
}

export function buildMockIndexJsonLd(mocks, seo) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${seo.canonical}#collection`,
    name: seo.title,
    description: seo.description,
    url: seo.canonical,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: mocks.length,
      itemListElement: mocks.map((mock, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'LearningResource',
          name: mock.title,
          url: `${SITE_URL}/mock/${encodeURIComponent(mock.slug)}`,
          learningResourceType: `Full-length IELTS ${skillLabel(mock.skill)} mock test`,
          educationalUse: 'IELTS exam preparation',
          isAccessibleForFree: false,
        },
      })),
    },
  };
}

export function buildMockTestJsonLd(mock, seo) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'LearningResource',
        '@id': `${seo.canonical}#resource`,
        name: mock.title,
        description: mock.description,
        url: seo.canonical,
        learningResourceType: `Full-length IELTS ${skillLabel(mock.skill)} mock test`,
        educationalUse: 'IELTS exam preparation',
        educationalLevel: 'Intermediate to Advanced',
        inLanguage: 'en',
        isAccessibleForFree: false,
        conditionsOfAccess: 'Requires an IELTS-Bank Premium subscription',
        timeRequired: duration(mock.durationSeconds),
        hasPart: Array.from({ length: mock.sectionCount }, (_, index) => ({
          '@type': 'LearningResource',
          name: `Section ${index + 1}`,
        })),
        teaches: `IELTS ${skillLabel(mock.skill)} performance under timed exam conditions`,
        about: { '@type': 'Thing', name: `IELTS ${skillLabel(mock.skill)}` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'IELTS Mock Tests',
            item: `${SITE_URL}/mock-test`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: mock.title,
            item: seo.canonical,
          },
        ],
      },
    ],
  };
}

export function serializeJsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

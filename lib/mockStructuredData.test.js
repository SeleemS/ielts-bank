import { describe, expect, it } from 'vitest';
import {
  buildMockIndexJsonLd,
  buildMockTestJsonLd,
  serializeJsonLd,
} from './mockStructuredData';

const seo = {
  title: 'Academic Reading Mock 1 | IELTS-Bank',
  description: 'A complete timed Academic Reading mock test.',
  canonical: 'https://www.ielts-bank.com/mock/academic-reading-mock-1',
};
const mock = {
  slug: 'academic-reading-mock-1',
  title: 'Academic Reading Mock 1',
  description: seo.description,
  skill: 'reading',
  durationSeconds: 3600,
  sectionCount: 3,
};

describe('mock-test structured data', () => {
  it('describes the mock index as a canonical collection', () => {
    const indexSeo = {
      ...seo,
      title: 'IELTS Mock Tests | IELTS-Bank',
      canonical: 'https://www.ielts-bank.com/mock-test',
    };
    const data = buildMockIndexJsonLd([mock], indexSeo);

    expect(data).toMatchObject({
      '@type': 'CollectionPage',
      '@id': `${indexSeo.canonical}#collection`,
      url: indexSeo.canonical,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: 1,
      },
    });
    expect(data.mainEntity.itemListElement[0]).toMatchObject({
      position: 1,
      item: {
        '@type': 'LearningResource',
        url: seo.canonical,
        isAccessibleForFree: false,
      },
    });
  });

  it('publishes an accurate timed Premium learning-resource contract', () => {
    const resource = buildMockTestJsonLd(mock, seo)['@graph'][0];

    expect(resource).toMatchObject({
      '@type': 'LearningResource',
      '@id': `${seo.canonical}#resource`,
      url: seo.canonical,
      learningResourceType: 'Full-length IELTS Reading mock test',
      isAccessibleForFree: false,
      conditionsOfAccess: 'Requires an IELTS-Bank Premium subscription',
      timeRequired: 'PT60M',
    });
    expect(resource.hasPart).toHaveLength(3);
    expect(resource.hasPart.map(({ name }) => name))
      .toEqual(['Section 1', 'Section 2', 'Section 3']);
  });

  it('publishes a canonical Home to Mock Tests to exercise breadcrumb', () => {
    const breadcrumb = buildMockTestJsonLd(mock, seo)['@graph'][1];

    expect(breadcrumb['@type']).toBe('BreadcrumbList');
    expect(breadcrumb.itemListElement.map(({ item }) => item)).toEqual([
      'https://www.ielts-bank.com',
      'https://www.ielts-bank.com/mock-test',
      seo.canonical,
    ]);
  });

  it('escapes HTML-significant characters before embedding JSON-LD', () => {
    const payload = buildMockTestJsonLd(
      { ...mock, title: '</script><script>alert("x")</script>' },
      seo
    );
    const serialized = serializeJsonLd(payload);

    expect(serialized).not.toContain('<');
    expect(JSON.parse(serialized)['@graph'][0].name)
      .toBe('</script><script>alert("x")</script>');
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildWritingQuestionJsonLd,
  serializeJsonLd,
} from './writingQuestionSeo';

const input = {
  canonicalUrl:
    'https://www.ielts-bank.com/writingquestion/advantages-of-public-transport',
  title: 'Advantages of Public Transport',
  description: 'Practise an IELTS Writing Task 2 essay about public transport.',
  task: 2,
  difficulty: 'medium',
};

describe('writing question structured data', () => {
  it('publishes a timed learning resource tied to the canonical exercise', () => {
    const resource = buildWritingQuestionJsonLd(input)['@graph'][0];

    expect(resource).toMatchObject({
      '@type': 'LearningResource',
      '@id': `${input.canonicalUrl}#resource`,
      name: input.title,
      description: input.description,
      url: input.canonicalUrl,
      learningResourceType: 'IELTS Writing Task 2 practice question',
      educationalLevel: 'medium',
      inLanguage: 'en',
      isAccessibleForFree: true,
      timeRequired: 'PT40M',
    });
  });

  it('uses the IELTS Task 1 time contract when appropriate', () => {
    const resource = buildWritingQuestionJsonLd({ ...input, task: 1 })['@graph'][0];

    expect(resource.learningResourceType).toBe('IELTS Writing Task 1 practice question');
    expect(resource.timeRequired).toBe('PT20M');
  });

  it('publishes a three-level canonical breadcrumb trail', () => {
    const breadcrumb = buildWritingQuestionJsonLd(input)['@graph'][1];

    expect(breadcrumb['@type']).toBe('BreadcrumbList');
    expect(breadcrumb.itemListElement).toEqual([
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://www.ielts-bank.com',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'IELTS Writing',
        item: 'https://www.ielts-bank.com/writingquestion',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: input.title,
        item: input.canonicalUrl,
      },
    ]);
  });

  it('escapes HTML-significant characters before embedding JSON-LD', () => {
    const payload = buildWritingQuestionJsonLd({
      ...input,
      title: '</script><script>alert("x")</script>',
    });
    const serialized = serializeJsonLd(payload);

    expect(serialized).not.toContain('<');
    expect(JSON.parse(serialized)['@graph'][0].name)
      .toBe('</script><script>alert("x")</script>');
  });
});

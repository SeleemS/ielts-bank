import { describe, expect, it } from 'vitest';
import {
  buildSpeakingQuestionJsonLd,
  serializeJsonLd,
} from './speakingQuestionSeo';

const input = {
  canonicalUrl:
    'https://www.ielts-bank.com/speakingquestion/describe-a-place-you-like',
  topic: 'Describe a place you like',
  description: 'Practise IELTS Speaking Part 2 with a realistic cue card.',
  partLabel: 'Part 2',
  difficulty: 'medium',
};

describe('speaking question structured data', () => {
  it('publishes a learning resource tied to the canonical exercise', () => {
    const resource = buildSpeakingQuestionJsonLd(input)['@graph'][0];

    expect(resource).toMatchObject({
      '@type': 'LearningResource',
      '@id': `${input.canonicalUrl}#resource`,
      name: input.topic,
      description: input.description,
      url: input.canonicalUrl,
      learningResourceType: 'IELTS Speaking Part 2 practice question',
      educationalLevel: 'medium',
      inLanguage: 'en',
      isAccessibleForFree: true,
    });
  });

  it('publishes a three-level canonical breadcrumb trail', () => {
    const breadcrumb = buildSpeakingQuestionJsonLd(input)['@graph'][1];

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
        name: 'IELTS Speaking',
        item: 'https://www.ielts-bank.com/speakingquestion',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: input.topic,
        item: input.canonicalUrl,
      },
    ]);
  });

  it('escapes HTML-significant characters before embedding JSON-LD', () => {
    const payload = buildSpeakingQuestionJsonLd({
      ...input,
      topic: '</script><script>alert("x")</script>',
    });
    const serialized = serializeJsonLd(payload);

    expect(serialized).not.toContain('<');
    expect(JSON.parse(serialized)['@graph'][0].name)
      .toBe('</script><script>alert("x")</script>');
  });
});

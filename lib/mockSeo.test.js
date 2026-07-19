import { describe, expect, it } from 'vitest';
import { MOCK_INDEX_SEO, getMockSeo } from './mockSeo';

describe('mock-test share metadata', () => {
  it('provides a complete branded contract for the mock-test hub', () => {
    expect(MOCK_INDEX_SEO).toEqual(
      expect.objectContaining({
        title: 'IELTS Mock Tests | IELTS-Bank',
        canonical: 'https://www.ielts-bank.com/mock-test',
        imageAlt: expect.stringContaining('IELTS'),
      })
    );
    expect(MOCK_INDEX_SEO.description.length).toBeGreaterThan(80);
    expect(MOCK_INDEX_SEO.ogImage).toBe(
      'https://www.ielts-bank.com/api/og?title=Full-length%20IELTS%20mock%20tests&type=mock'
    );
  });

  it('encodes route and image parameters for an individual mock safely', () => {
    const seo = getMockSeo({
      title: 'Reading & Listening Mock',
      description: 'A complete mock with a detailed score.',
      slug: 'reading & listening',
      skill: 'reading',
    });

    expect(seo).toEqual({
      title: 'Reading & Listening Mock | IELTS-Bank',
      description: 'A complete mock with a detailed score.',
      canonical: 'https://www.ielts-bank.com/mock/reading%20%26%20listening',
      ogImage:
        'https://www.ielts-bank.com/api/og?title=Reading%20%26%20Listening%20Mock&type=mock&subtitle=Reading',
      imageAlt: 'Reading & Listening Mock — IELTS-Bank',
    });
  });
});

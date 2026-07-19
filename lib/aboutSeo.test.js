import { describe, expect, it } from 'vitest';
import { ABOUT_SEO } from './aboutSeo';

describe('about page SEO', () => {
  it('publishes a complete canonical social-card contract', () => {
    expect(ABOUT_SEO.title).toBe('About Us | IELTS-Bank');
    expect(ABOUT_SEO.description).toContain('free IELTS practice');
    expect(ABOUT_SEO.canonical).toBe('https://www.ielts-bank.com/about');
    expect(ABOUT_SEO.imageAlt).toContain('our mission');
  });

  it('encodes every dynamic social-card parameter safely', () => {
    const url = new URL(ABOUT_SEO.ogImage);

    expect(url.pathname).toBe('/api/og');
    expect(url.searchParams.get('title'))
      .toBe('Accessible IELTS preparation for everyone');
    expect(url.searchParams.get('type')).toBe('about');
    expect(url.searchParams.get('subtitle')).toBe('Our Mission');
  });
});

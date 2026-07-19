import { describe, expect, it } from 'vitest';
import { TERMS_SEO } from './termsSeo';

describe('terms page SEO', () => {
  it('publishes a complete canonical social-card contract', () => {
    expect(TERMS_SEO.title).toBe('Terms of Service | IELTS-Bank');
    expect(TERMS_SEO.description).toContain('14-day refund policy');
    expect(TERMS_SEO.canonical).toBe('https://www.ielts-bank.com/termsofservice');
    expect(TERMS_SEO.imageAlt).toContain('cancellation');
  });

  it('encodes every dynamic social-card parameter safely', () => {
    const url = new URL(TERMS_SEO.ogImage);

    expect(url.pathname).toBe('/api/og');
    expect(url.searchParams.get('title')).toBe('IELTS-Bank service and billing terms');
    expect(url.searchParams.get('type')).toBe('legal');
    expect(url.searchParams.get('subtitle')).toBe('Terms');
  });
});

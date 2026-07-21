import { describe, expect, it } from 'vitest';
import { PRIVACY_LAST_UPDATED, PRIVACY_SEO } from './privacySeo';

describe('privacy policy SEO', () => {
  it('publishes a complete canonical social-card contract', () => {
    expect(PRIVACY_LAST_UPDATED).toBe('July 21, 2026');
    expect(PRIVACY_SEO.title).toBe('Privacy Policy | IELTS-Bank');
    expect(PRIVACY_SEO.description).toContain('GDPR and CCPA');
    expect(PRIVACY_SEO.canonical).toBe('https://www.ielts-bank.com/privacypolicy');
    expect(PRIVACY_SEO.imageAlt).toContain('data protection');
  });

  it('encodes every dynamic social-card parameter safely', () => {
    const url = new URL(PRIVACY_SEO.ogImage);

    expect(url.pathname).toBe('/api/og');
    expect(url.searchParams.get('title')).toBe('How IELTS-Bank protects your data');
    expect(url.searchParams.get('type')).toBe('legal');
    expect(url.searchParams.get('subtitle')).toBe('Privacy');
  });
});

import { describe, expect, it } from 'vitest';
import { SPEAKING_EXAMINER_SEO } from './speakingExaminerSeo';

describe('speaking examiner SEO', () => {
  it('publishes a complete canonical social-card contract', () => {
    expect(SPEAKING_EXAMINER_SEO.title).toContain('Speaking Examiner');
    expect(SPEAKING_EXAMINER_SEO.description).toContain('Part 3');
    expect(SPEAKING_EXAMINER_SEO.canonical)
      .toBe('https://www.ielts-bank.com/speaking-examiner');
    expect(SPEAKING_EXAMINER_SEO.imageAlt).toContain('Speaking examiner');
  });

  it('encodes every dynamic social-card parameter safely', () => {
    const url = new URL(SPEAKING_EXAMINER_SEO.ogImage);

    expect(url.origin).toBe('https://www.ielts-bank.com');
    expect(url.pathname).toBe('/api/og');
    expect(url.searchParams.get('title'))
      .toBe('Practise a real IELTS Speaking interview');
    expect(url.searchParams.get('type')).toBe('examiner');
    expect(url.searchParams.get('subtitle')).toBe('Live AI');
  });
});

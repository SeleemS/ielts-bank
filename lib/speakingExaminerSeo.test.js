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

  it('names the live model in the title, description and image alt', () => {
    expect(SPEAKING_EXAMINER_SEO.title).toContain('gpt-live-1');
    expect(SPEAKING_EXAMINER_SEO.description).toContain('gpt-live-1');
    expect(SPEAKING_EXAMINER_SEO.imageAlt).toContain('gpt-live-1');
  });

  it('keeps the title and description within search-snippet limits', () => {
    expect(SPEAKING_EXAMINER_SEO.title.length).toBeLessThanOrEqual(60);
    expect(SPEAKING_EXAMINER_SEO.description.length).toBeLessThanOrEqual(160);
  });

  it('encodes every dynamic social-card parameter safely', () => {
    const url = new URL(SPEAKING_EXAMINER_SEO.ogImage);

    expect(url.origin).toBe('https://www.ielts-bank.com');
    expect(url.pathname).toBe('/api/og');
    expect(url.searchParams.get('title'))
      .toBe('A live IELTS Speaking interview on gpt-live-1');
    expect(url.searchParams.get('type')).toBe('examiner');
    expect(url.searchParams.get('subtitle')).toBe('Live AI examiner · full-duplex');
  });
});

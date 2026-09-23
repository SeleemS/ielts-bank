import { describe, expect, it } from 'vitest';
import { WRITING_CHECKER_SEO } from './writingCheckerSeo';

describe('writing checker SEO', () => {
  it('publishes a complete canonical social-card contract', () => {
    expect(WRITING_CHECKER_SEO.title).toContain('Writing Checker');
    expect(WRITING_CHECKER_SEO.description).toContain('first AI IELTS Writing score free');
    expect(WRITING_CHECKER_SEO.canonical)
      .toBe('https://www.ielts-bank.com/ielts-writing-checker');
    expect(WRITING_CHECKER_SEO.imageAlt).toContain('free AI band score');
  });

  it('encodes every dynamic social-card parameter safely', () => {
    const url = new URL(WRITING_CHECKER_SEO.ogImage);

    expect(url.pathname).toBe('/api/og');
    expect(url.searchParams.get('title')).toBe('Check your IELTS Writing band');
    expect(url.searchParams.get('type')).toBe('writing');
    expect(url.searchParams.get('subtitle')).toBe('Free AI Score');
  });
});

describe('writing checker structured data', () => {
  it('describes the tool as a free-to-try WebApplication without invented ratings', async () => {
    const { buildWritingCheckerAppJsonLd } = await import('./writingCheckerSeo');
    const app = buildWritingCheckerAppJsonLd();
    expect(app['@type']).toBe('WebApplication');
    expect(app.url).toBe('https://www.ielts-bank.com/ielts-writing-checker');
    expect(app.applicationCategory).toBe('EducationalApplication');
    expect(app.offers).toMatchObject({ '@type': 'Offer', price: '0', priceCurrency: 'USD' });
    expect(app.aggregateRating).toBeUndefined();
    // Round-trips as JSON (what the page serialises into <script>).
    expect(JSON.parse(JSON.stringify(app))).toEqual(app);
  });
});

import { describe, expect, it } from 'vitest';
import { BAND_CALCULATOR_SEO } from './bandCalculatorSeo';

describe('band calculator SEO', () => {
  it('publishes a complete canonical social-card contract', () => {
    expect(BAND_CALCULATOR_SEO.title).toContain('Band Score Calculator');
    expect(BAND_CALCULATOR_SEO.description).toContain('official rounding rule');
    expect(BAND_CALCULATOR_SEO.canonical)
      .toBe('https://www.ielts-bank.com/band-calculator');
    expect(BAND_CALCULATOR_SEO.imageAlt).toContain('all four skills');
  });

  it('encodes every dynamic social-card parameter safely', () => {
    const url = new URL(BAND_CALCULATOR_SEO.ogImage);

    expect(url.pathname).toBe('/api/og');
    expect(url.searchParams.get('title')).toBe('Calculate your IELTS band score');
    expect(url.searchParams.get('type')).toBe('calculator');
    expect(url.searchParams.get('subtitle')).toBe('Free Tool');
  });
});

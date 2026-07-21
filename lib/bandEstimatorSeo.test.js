import { describe, expect, it } from 'vitest';
import { BAND_ESTIMATOR_SEO } from './bandEstimatorSeo';
import { ogTypeLabel } from './ogCard';

describe('band estimator SEO', () => {
  it('publishes a complete canonical social-card contract', () => {
    expect(BAND_ESTIMATOR_SEO.title).toContain('15-Minute Level Test');
    expect(BAND_ESTIMATOR_SEO.description).toContain('marked Writing sample');
    expect(BAND_ESTIMATOR_SEO.description).toContain('Free to start');
    expect(BAND_ESTIMATOR_SEO.description).toContain('sign up to reveal Writing');
    expect(BAND_ESTIMATOR_SEO.description).not.toContain('self-check your Writing');
    expect(BAND_ESTIMATOR_SEO.description).not.toContain('no sign-up');
    expect(BAND_ESTIMATOR_SEO.canonical)
      .toBe('https://www.ielts-bank.com/band-estimator');
    expect(BAND_ESTIMATOR_SEO.imageAlt).toContain('all four skills');
  });

  it('encodes every dynamic social-card parameter safely', () => {
    const url = new URL(BAND_ESTIMATOR_SEO.ogImage);

    expect(url.pathname).toBe('/api/og');
    expect(url.searchParams.get('title')).toBe('What is your IELTS band?');
    expect(url.searchParams.get('type')).toBe('estimator');
    expect(url.searchParams.get('subtitle')).toBe('Free 15-minute level test');
    expect(ogTypeLabel(url.searchParams.get('type'))).toBe('BAND ESTIMATOR');
  });
});

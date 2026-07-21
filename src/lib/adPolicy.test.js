import { describe, expect, it } from 'vitest';
import { adsAllowedForConsent, adsAllowedForPath } from './adPolicy';

describe('AdSense route policy', () => {
  it('keeps acquisition, account, checkout, and protected practice flows ad-free', () => {
    for (const path of [
      '/pricing',
      '/pricing?checkout=success&session_id=cs_test_123',
      '/billing/manage',
      '/dashboard',
      '/auth/callback',
      '/band-estimator',
      '/ielts-writing-checker',
      '/mock/academic-reading-mock-1',
      '/readingquestion/example',
      '/writingquestion/example',
      '/listeningquestion/example',
      '/speakingquestion/example',
    ]) {
      expect(adsAllowedForPath(path), path).toBe(false);
    }
  });

  it('continues allowing ads on public editorial and section-list pages', () => {
    for (const path of [
      '/',
      '/blog',
      '/blog/ielts-reading-time-management',
      '/readingquestion',
      '/listeningquestion',
      '/about',
    ]) {
      expect(adsAllowedForPath(path), path).toBe(true);
    }
  });

  it('loads optional advertising only after consent is granted', () => {
    expect(adsAllowedForConsent('granted')).toBe(true);
    expect(adsAllowedForConsent('denied')).toBe(false);
    expect(adsAllowedForConsent(null)).toBe(false);
    expect(adsAllowedForConsent(undefined)).toBe(false);
  });
});

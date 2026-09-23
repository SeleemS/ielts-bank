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
      '/ielts-writing-checker/task-2',
      '/ielts-writing-checker/task-1',
      '/ielts-writing-checker/general-training-letter?entry=essay_bank',
      '/mock/academic-reading-mock-1',
      '/readingquestion/example',
      '/writingquestion/example',
      '/listeningquestion/example',
      '/speakingquestion/example',
      // Only the exact answers sub-route is ad-eligible, not look-alikes.
      '/readingquestion/example?tab=answers',
      '/readingquestion/answers',
      '/writingquestion/example/answers',
      '/listeningquestion/example/answers-draft',
    ]) {
      expect(adsAllowedForPath(path), path).toBe(false);
    }
  });

  it('continues allowing ads on public editorial and section-list pages', () => {
    for (const path of [
      '/',
      '/blog',
      '/blog/ielts-reading-time-management',
      '/ielts-essay-bank',
      '/ielts-question-bank',
      '/ielts-speaking-cue-cards',
      '/ielts-essay-bank/free-university-education-band-7',
      '/readingquestion',
      '/listeningquestion',
      '/about',
      '/readingquestion/why-the-body-needs-vitamins-1bndxg/answers',
      '/listeningquestion/booking-an-airport-taxi-abc123/answers',
      '/readingquestion/why-the-body-needs-vitamins-1bndxg/answers?utm_source=x',
      '/readingquestion/why-the-body-needs-vitamins-1bndxg/answers#answer-3',
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

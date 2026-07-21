import { describe, expect, it } from 'vitest';
import { BAND_ESTIMATOR_FAQ } from './bandEstimatorFaq';

describe('band estimator account FAQ', () => {
  it('describes the anonymous fallback and marked-sample reveal gate without contradiction', () => {
    const account = BAND_ESTIMATOR_FAQ.find((item) => item.q === 'Do I need an account?');

    expect(account?.a).toContain('complete the estimator anonymously');
    expect(account?.a).toContain('Writing self-check');
    expect(account?.a).toContain('marked Writing sample');
    expect(account?.a).toContain('free account is required to reveal');
    expect(account?.a).not.toContain('complete estimate is anonymous');
    expect(account?.a).not.toContain('account afterward');
  });
});

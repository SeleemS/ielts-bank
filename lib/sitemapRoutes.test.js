import { describe, expect, it } from 'vitest';
import { STATIC_ROUTES } from '../pages/sitemap.xml';

describe('sitemap static-route inventory', () => {
  it('includes every indexable acquisition and conversion route', () => {
    expect(STATIC_ROUTES).toEqual(
      expect.arrayContaining([
        '/',
        '/pricing',
        '/band-calculator',
        '/band-estimator',
        '/ielts-writing-checker',
        '/speaking-examiner',
        '/mock-test',
      ])
    );
  });

  it('contains no duplicate or private/system routes', () => {
    expect(new Set(STATIC_ROUTES).size).toBe(STATIC_ROUTES.length);
    expect(STATIC_ROUTES).not.toEqual(
      expect.arrayContaining([
        '/auth/callback',
        '/billing/manage',
        '/dashboard',
        '/404',
        '/500',
      ])
    );
  });
});

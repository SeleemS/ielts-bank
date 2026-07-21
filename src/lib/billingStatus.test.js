import { describe, expect, it } from 'vitest';
import { billingStatusMessage, canOfferBillingPause } from './billingStatus';

describe('billing status display', () => {
  it('describes a scheduled cancellation as access that will not renew', () => {
    const message = billingStatusMessage({
      planStatus: 'canceled',
      renewsAt: '2026-08-19T04:35:48.000Z',
      isPremium: true,
    });

    expect(message).toContain('Premium access continues until');
    expect(message).toContain('It will not renew.');
    expect(message).not.toContain('next renewal');
  });

  it('keeps renewal, Exam Pass, and active-pause messages distinct', () => {
    expect(billingStatusMessage({
      planStatus: 'active',
      renewsAt: '2026-08-19T04:35:48.000Z',
      isPremium: true,
    })).toContain('next renewal');

    expect(billingStatusMessage({
      expiresAt: '2026-08-16T04:35:48.000Z',
      isPremium: true,
    })).toContain('Exam Pass ends');

    expect(billingStatusMessage({
      pauseUntil: '2026-07-25T04:35:48.000Z',
      isPremium: false,
      now: new Date('2026-07-19T04:35:48.000Z').getTime(),
    })).toContain('current pause ends');

    expect(billingStatusMessage({
      planStatus: 'paused',
      pauseUntil: '2026-07-18T04:35:48.000Z',
      isPremium: false,
      now: new Date('2026-07-19T04:35:48.000Z').getTime(),
    })).toContain('access returns after Stripe confirms payment');
  });

  it('does not offer another billing pause after cancellation is scheduled', () => {
    const base = {
      isPremium: true,
      renewsAt: '2026-08-19T04:35:48.000Z',
      expiresAt: null,
      pauseUsedAt: null,
    };

    expect(canOfferBillingPause({ ...base, planStatus: 'active' })).toBe(true);
    expect(canOfferBillingPause({ ...base, planStatus: 'canceled' })).toBe(false);
  });
});

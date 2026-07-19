import { describe, expect, it } from 'vitest';
import { isPremiumRow } from './premium';

const NOW = new Date('2026-07-19T12:00:00.000Z').getTime();

describe('isPremiumRow', () => {
  it('accepts active, trialing, and past-due subscription grace states', () => {
    for (const planStatus of ['active', 'trialing', 'past_due']) {
      expect(isPremiumRow({ plan: 'premium', plan_status: planStatus }, NOW)).toBe(true);
    }
  });

  it('keeps canceled subscriptions active only through their paid period', () => {
    expect(
      isPremiumRow(
        {
          plan: 'premium',
          plan_status: 'canceled',
          plan_renews_at: '2026-07-20T12:00:00.000Z',
        },
        NOW
      )
    ).toBe(true);
    expect(
      isPremiumRow(
        {
          plan: 'premium',
          plan_status: 'canceled',
          plan_renews_at: '2026-07-18T12:00:00.000Z',
        },
        NOW
      )
    ).toBe(false);
  });

  it('accepts only an unexpired Exam Pass', () => {
    expect(
      isPremiumRow(
        {
          plan: 'premium',
          plan_status: 'active',
          plan_expires_at: '2026-07-20T12:00:00.000Z',
        },
        NOW
      )
    ).toBe(true);
    expect(
      isPremiumRow(
        {
          plan: 'premium',
          plan_status: 'active',
          plan_expires_at: '2026-07-18T12:00:00.000Z',
        },
        NOW
      )
    ).toBe(false);
    expect(
      isPremiumRow(
        {
          plan: 'free',
          plan_status: 'refunded',
          plan_expires_at: '2026-07-18T12:00:00.000Z',
        },
        NOW
      )
    ).toBe(false);
  });

  it('blocks access during an active billing pause and restores it afterward', () => {
    const row = {
      plan: 'premium',
      plan_status: 'active',
      billing_pause_until: '2026-07-20T12:00:00.000Z',
    };
    expect(isPremiumRow(row, NOW)).toBe(false);
    expect(
      isPremiumRow(
        { ...row, billing_pause_until: '2026-07-18T12:00:00.000Z' },
        NOW
      )
    ).toBe(true);
  });
});

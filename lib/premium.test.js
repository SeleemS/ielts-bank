import { describe, expect, it } from 'vitest';
import { fetchIsPremium, fetchPremiumStatus, isPremiumRow } from './premium';

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

function makeAdmin(result) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (result instanceof Error) throw result;
            return result;
          },
        }),
      }),
    }),
  };
}

describe('server Premium status', () => {
  it('returns a verified Premium result without an error', async () => {
    const status = await fetchPremiumStatus(
      makeAdmin({
        data: {
          plan: 'premium',
          plan_status: 'active',
          plan_renews_at: null,
          plan_expires_at: null,
          billing_pause_until: null,
        },
        error: null,
      }),
      'user-1'
    );

    expect(status).toEqual({ isPremium: true, error: null });
  });

  it('keeps a verified Free result distinct from query failure', async () => {
    const status = await fetchPremiumStatus(
      makeAdmin({
        data: { plan: 'free', plan_status: 'inactive' },
        error: null,
      }),
      'user-1'
    );

    expect(status).toEqual({ isPremium: false, error: null });
  });

  it('exposes resolved and rejected query failures', async () => {
    const resolvedError = new Error('database unavailable');
    await expect(
      fetchPremiumStatus(
        makeAdmin({ data: null, error: resolvedError }),
        'user-1'
      )
    ).resolves.toEqual({ isPremium: false, error: resolvedError });

    const rejectedError = new Error('network unavailable');
    await expect(
      fetchPremiumStatus(makeAdmin(rejectedError), 'user-1')
    ).resolves.toEqual({ isPremium: false, error: rejectedError });
  });

  it('keeps the compatibility helper fail-closed', async () => {
    await expect(
      fetchIsPremium(
        makeAdmin({ data: null, error: new Error('database unavailable') }),
        'user-1'
      )
    ).resolves.toBe(false);
  });
});

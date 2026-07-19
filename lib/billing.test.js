// lib/billing.test.js
// Unit tests for the Stripe billing core: price resolution (PPP), subscription
// → plan mapping, and the webhook event handler (mocked Supabase/Stripe deps).
import { describe, it, expect } from 'vitest';
import {
  resolveLookupKey,
  isPppCountry,
  mapSubscriptionToPlanFields,
  subscriptionPeriodEnd,
  subscriptionIsPpp,
  handleStripeEvent,
  skuFromLookupKey,
  REALTIME_SECONDS_GLOBAL,
  REALTIME_SECONDS_PPP,
} from './billing';

// ---------------------------------------------------------------------------
// Price resolution / PPP
// ---------------------------------------------------------------------------
describe('resolveLookupKey', () => {
  it('maps global countries to list prices', () => {
    expect(resolveLookupKey('monthly', 'US')).toBe('premium_monthly');
    expect(resolveLookupKey('6month', 'GB')).toBe('premium_6month');
    expect(resolveLookupKey('annual', 'DE')).toBe('premium_annual');
    expect(resolveLookupKey('annual', '')).toBe('premium_annual'); // unknown geo → global
  });

  it('maps PPP countries to _ppp prices', () => {
    expect(resolveLookupKey('monthly', 'IN')).toBe('premium_monthly_ppp');
    expect(resolveLookupKey('6month', 'PK')).toBe('premium_6month_ppp');
    expect(resolveLookupKey('annual', 'VN')).toBe('premium_annual_ppp');
    expect(resolveLookupKey('monthly', 'ng')).toBe('premium_monthly_ppp'); // case-insensitive
  });

  it('rejects unknown SKUs', () => {
    expect(resolveLookupKey('lifetime', 'US')).toBeNull();
  });

  it('classifies PPP membership', () => {
    expect(isPppCountry('IN')).toBe(true);
    expect(isPppCountry('US')).toBe(false);
    expect(isPppCountry(undefined)).toBe(false);
    for (const fullPriceMarket of ['SA', 'AE', 'QA', 'KW', 'BH', 'OM', 'SY', 'IR', 'SD']) {
      expect(isPppCountry(fullPriceMarket)).toBe(false);
    }
  });

  it('supports the one-time Exam Pass lookup', () => {
    expect(resolveLookupKey('exam_pass', 'US')).toBe('premium_exam_pass');
    expect(resolveLookupKey('exam_pass', 'IN')).toBe('premium_exam_pass_ppp');
    expect(skuFromLookupKey('premium_exam_pass_ppp')).toBe('exam_pass');
  });
});

// ---------------------------------------------------------------------------
// Subscription mapping
// ---------------------------------------------------------------------------
const PERIOD_END = 1800000000; // unix seconds

function sub(overrides = {}) {
  return {
    id: 'sub_123',
    customer: 'cus_123',
    status: 'active',
    cancel_at_period_end: false,
    current_period_end: PERIOD_END,
    created: 1760000000,
    metadata: {},
    items: { data: [{ price: { lookup_key: 'premium_monthly' } }] },
    ...overrides,
  };
}

describe('mapSubscriptionToPlanFields', () => {
  it('active → premium/active with renews_at', () => {
    const f = mapSubscriptionToPlanFields(sub());
    expect(f).toMatchObject({
      plan: 'premium',
      plan_status: 'active',
      stripe_customer_id: 'cus_123',
      stripe_subscription_id: 'sub_123',
    });
    expect(f.plan_renews_at).toBe(new Date(PERIOD_END * 1000).toISOString());
    expect(f.plan_sku).toBe('monthly');
    expect(f.premium_since).toBe(new Date(1760000000 * 1000).toISOString());
  });

  it('trialing → premium/trialing', () => {
    expect(mapSubscriptionToPlanFields(sub({ status: 'trialing' })).plan_status).toBe('trialing');
  });

  it('cancel_at_period_end keeps premium but marks canceled (access to period end)', () => {
    const f = mapSubscriptionToPlanFields(sub({ cancel_at_period_end: true }));
    expect(f.plan).toBe('premium');
    expect(f.plan_status).toBe('canceled');
  });

  it('past_due keeps premium in grace', () => {
    const f = mapSubscriptionToPlanFields(sub({ status: 'past_due' }));
    expect(f).toMatchObject({ plan: 'premium', plan_status: 'past_due' });
  });

  it('canceled/unpaid/incomplete_expired → free', () => {
    for (const status of ['canceled', 'unpaid', 'incomplete_expired']) {
      expect(mapSubscriptionToPlanFields(sub({ status })).plan).toBe('free');
    }
  });

  it('incomplete → not entitled', () => {
    const f = mapSubscriptionToPlanFields(sub({ status: 'incomplete' }));
    expect(f).toMatchObject({ plan: 'free', plan_status: 'inactive' });
  });

  it('reads period end from item shape (newer API versions)', () => {
    const s = sub({ current_period_end: undefined });
    s.items.data[0].current_period_end = PERIOD_END;
    expect(subscriptionPeriodEnd(s)).toBe(new Date(PERIOD_END * 1000).toISOString());
  });
});

describe('subscriptionIsPpp', () => {
  it('detects via metadata and lookup key', () => {
    expect(subscriptionIsPpp(sub({ metadata: { ppp: '1' } }))).toBe(true);
    const s = sub();
    s.items.data[0].price.lookup_key = 'premium_6month_ppp';
    expect(subscriptionIsPpp(s)).toBe(true);
    expect(subscriptionIsPpp(sub())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Webhook event handler (mocked deps)
// ---------------------------------------------------------------------------
function mockAdmin({ userRow = { id: 'user-1', email: 'learner@example.com' } } = {}) {
  const calls = { updates: [], inserts: [] };
  const admin = {
    from(table) {
      return {
        update(fields) {
          return {
            eq(col, val) {
              calls.updates.push({ table, fields, col, val });
              return Promise.resolve({ error: null });
            },
          };
        },
        insert(fields) {
          calls.inserts.push({ table, fields });
          return Promise.resolve({ error: null });
        },
        select() {
          return {
            eq() {
              return { maybeSingle: () => Promise.resolve({ data: userRow }) };
            },
          };
        },
      };
    },
  };
  return { admin, calls };
}

function event(type, object) {
  return { id: `evt_${type}`, type, data: { object } };
}

describe('handleStripeEvent', () => {
  it('checkout.session.completed activates premium and seeds realtime quota', async () => {
    const { admin, calls } = mockAdmin();
    const stripe = { subscriptions: { retrieve: async () => sub() } };
    const out = await handleStripeEvent(
      event('checkout.session.completed', {
        id: 'cs_test_subscription',
        mode: 'subscription',
        subscription: 'sub_123',
        customer: 'cus_123',
        client_reference_id: 'user-1',
      }),
      { admin, stripe }
    );
    expect(out).toContain('activated user user-1');
    const userUpdate = calls.updates.find((u) => u.table === 'users');
    expect(userUpdate.fields).toMatchObject({ plan: 'premium', plan_status: 'active' });
    expect(userUpdate.fields.plan_started_at).toBeTruthy();
    const quotaUpdate = calls.updates.find((u) => u.table === 'user_quotas');
    expect(quotaUpdate.fields.realtime_seconds_quota).toBe(REALTIME_SECONDS_GLOBAL);
    expect(quotaUpdate.fields.realtime_seconds_remaining).toBe(REALTIME_SECONDS_GLOBAL);
    expect(calls.inserts.some((call) => call.table === 'activity_events' && call.fields.event === 'subscription_activated')).toBe(true);
    expect(
      calls.inserts.some(
        (call) =>
          call.table === 'lifecycle_emails' &&
          call.fields.idempotency_key === 'welcome_purchase:cs_test_subscription'
      )
    ).toBe(true);
  });

  it('seeds the PPP realtime allowance for PPP subscriptions', async () => {
    const { admin, calls } = mockAdmin();
    const stripe = { subscriptions: { retrieve: async () => sub({ metadata: { ppp: '1' } }) } };
    await handleStripeEvent(
      event('checkout.session.completed', {
        mode: 'subscription',
        subscription: 'sub_123',
        customer: 'cus_123',
        client_reference_id: 'user-1',
      }),
      { admin, stripe }
    );
    const quotaUpdate = calls.updates.find((u) => u.table === 'user_quotas');
    expect(quotaUpdate.fields.realtime_seconds_quota).toBe(REALTIME_SECONDS_PPP);
  });

  it('checkout with no user mapping signals a retryable error', async () => {
    const { admin } = mockAdmin({ userRow: null });
    const stripe = { subscriptions: { retrieve: async () => sub() } };
    const out = await handleStripeEvent(
      event('checkout.session.completed', {
        mode: 'subscription',
        subscription: 'sub_123',
        customer: 'cus_999',
        client_reference_id: null,
      }),
      { admin, stripe }
    );
    expect(out.startsWith('error:')).toBe(true);
  });

  it('paid Exam Pass checkout grants 28 days without a subscription', async () => {
    const { admin, calls } = mockAdmin();
    const out = await handleStripeEvent(
      event('checkout.session.completed', {
        id: 'cs_test_pass',
        mode: 'payment',
        payment_status: 'paid',
        amount_total: 1499,
        customer: 'cus_123',
        client_reference_id: 'user-1',
        metadata: { sku: 'exam_pass', ppp: '0' },
      }),
      { admin, stripe: {} }
    );
    expect(out).toContain('exam pass');
    const userUpdate = calls.updates.find((update) => update.table === 'users');
    expect(userUpdate.fields).toMatchObject({
      plan: 'premium',
      plan_status: 'active',
      plan_sku: 'exam_pass',
      stripe_subscription_id: null,
    });
    expect(new Date(userUpdate.fields.plan_expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(
      calls.inserts.some(
        (call) =>
          call.table === 'lifecycle_emails' &&
          call.fields.idempotency_key === 'welcome_purchase:cs_test_pass'
      )
    ).toBe(true);
  });

  it('ignores non-subscription checkouts', async () => {
    const { admin } = mockAdmin();
    const out = await handleStripeEvent(
      event('checkout.session.completed', { mode: 'payment' }),
      { admin, stripe: {} }
    );
    expect(out).toContain('ignored');
  });

  it('subscription.updated with canceled status downgrades and revokes realtime quota', async () => {
    const { admin, calls } = mockAdmin();
    const out = await handleStripeEvent(
      event('customer.subscription.updated', sub({ status: 'canceled', metadata: { user_id: 'user-1' } })),
      { admin, stripe: {} }
    );
    expect(out).toContain('free/canceled');
    const quotaUpdate = calls.updates.find((u) => u.table === 'user_quotas');
    expect(quotaUpdate.fields).toMatchObject({
      realtime_seconds_quota: 0,
      realtime_seconds_remaining: 0,
    });
  });

  it('subscription.updated active keeps premium and does NOT touch quotas', async () => {
    const { admin, calls } = mockAdmin();
    await handleStripeEvent(
      event('customer.subscription.updated', sub({ metadata: { user_id: 'user-1' } })),
      { admin, stripe: {} }
    );
    expect(calls.updates.some((u) => u.table === 'user_quotas')).toBe(false);
  });

  it('subscription.deleted downgrades', async () => {
    const { admin, calls } = mockAdmin();
    const out = await handleStripeEvent(
      event('customer.subscription.deleted', sub({ metadata: { user_id: 'user-1' } })),
      { admin, stripe: {} }
    );
    expect(out).toContain('downgraded');
    const userUpdate = calls.updates.find((u) => u.table === 'users');
    expect(userUpdate.fields).toMatchObject({ plan: 'free', plan_status: 'canceled' });
  });

  it('invoice.payment_failed marks past_due', async () => {
    const { admin, calls } = mockAdmin();
    const out = await handleStripeEvent(
      event('invoice.payment_failed', { customer: 'cus_123' }),
      { admin, stripe: {} }
    );
    expect(out).toContain('past_due');
    expect(calls.updates[0].fields).toMatchObject({ plan_status: 'past_due' });
  });

  it('charge.refunded revokes subscriptions and unexpired Exam Pass access immediately', async () => {
    const { admin, calls } = mockAdmin();
    const out = await handleStripeEvent(
      event('charge.refunded', { customer: 'cus_123' }),
      { admin, stripe: {} }
    );
    expect(out).toContain('refunded');
    const userUpdate = calls.updates.find((u) => u.table === 'users');
    expect(userUpdate.fields).toMatchObject({
      plan: 'free',
      plan_status: 'refunded',
      plan_expires_at: null,
      billing_pause_until: null,
    });
  });

  it('resolves a dispute through its Charge because Dispute has no customer field', async () => {
    const { admin, calls } = mockAdmin();
    const retrieve = async (chargeId) => {
      expect(chargeId).toBe('ch_disputed');
      return { id: chargeId, customer: 'cus_123' };
    };
    const out = await handleStripeEvent(
      event('charge.dispute.created', { charge: 'ch_disputed' }),
      { admin, stripe: { charges: { retrieve } } }
    );
    expect(out).toContain('refunded');
    const userUpdate = calls.updates.find((u) => u.table === 'users');
    expect(userUpdate.fields).toMatchObject({
      plan: 'free',
      plan_status: 'refunded',
      plan_expires_at: null,
    });
  });

  it('acknowledges unknown events without side effects', async () => {
    const { admin, calls } = mockAdmin();
    const out = await handleStripeEvent(event('customer.created', {}), { admin, stripe: {} });
    expect(out).toContain('ignored');
    expect(calls.updates.length).toBe(0);
  });
});

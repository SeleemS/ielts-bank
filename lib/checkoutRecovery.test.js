// Abandoned-checkout recovery: session params, the checkout.session.expired
// webhook branch, recovered-session fulfillment, and the recovery email queue.
import { describe, expect, it, vi } from 'vitest';
import {
  CHECKOUT_EXPIRY_SECONDS,
  checkoutExpiryParams,
  liveRecoveryUrl,
  queueCheckoutRecoveryEmail,
  safeRecoveryUrl,
  upgradeFromSession,
} from './checkoutRecovery';
import { handleStripeEvent } from './billing';

const RECOVERY_URL = 'https://buy.stripe.com/r/live_asAb1724';
const NOW = new Date('2026-09-23T12:00:00.000Z');

// Minimal chainable Supabase double. `users` answers maybeSingle lookups,
// `recent` answers the 7-day cooldown query, inserts are recorded.
function fakeAdmin({
  user = { id: 'user-1', email: 'Learner@Example.com', plan: 'free', plan_status: 'inactive' },
  recent = [],
  insertError = null,
  userError = null,
  activityError = null,
} = {}) {
  const calls = { inserts: [], filters: [], rpcs: [] };
  const admin = {
    calls,
    async rpc(name, args) {
      calls.rpcs.push({ name, args });
      return { data: { status: 'applied', access_expires_at: args.p_fields.plan_expires_at || null }, error: null };
    },
    from(table) {
      const query = {
        select: () => query,
        eq: (column, value) => { calls.filters.push({ table, column, value }); return query; },
        gte: (column, value) => { calls.filters.push({ table, column, value, op: 'gte' }); return query; },
        limit: async () => ({ data: recent, error: null }),
        maybeSingle: async () => ({ data: user, error: userError }),
        insert: async (row) => {
          calls.inserts.push({ table, row });
          if (table === 'activity_events') return { error: activityError };
          return { error: insertError };
        },
      };
      return query;
    },
  };
  return admin;
}

function expiredEvent(object = {}) {
  return {
    id: 'evt_expired',
    type: 'checkout.session.expired',
    created: Math.floor(NOW.getTime() / 1000),
    data: {
      object: {
        id: 'cs_live_expired',
        object: 'checkout.session',
        mode: 'payment',
        status: 'expired',
        created: Math.floor(NOW.getTime() / 1000) - 3 * 3600,
        customer: 'cus_123',
        client_reference_id: 'user-1',
        amount_total: 599,
        currency: 'usd',
        success_url: 'https://www.ielts-bank.com/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}&upgrade=writing&stage=saved',
        metadata: { user_id: 'user-1', sku: 'exam_pass', ppp: '1', pass_days: '30' },
        after_expiration: {
          recovery: {
            enabled: true,
            allow_promotion_codes: true,
            url: RECOVERY_URL,
            expires_at: Math.floor(NOW.getTime() / 1000) + 30 * 86400,
          },
        },
        ...object,
      },
    },
  };
}

describe('checkoutExpiryParams', () => {
  it('expires sessions after three hours with Stripe recovery enabled', () => {
    const params = checkoutExpiryParams({ nowMs: NOW.getTime(), allowPromotionCodes: true });
    expect(CHECKOUT_EXPIRY_SECONDS).toBe(3 * 3600);
    expect(params.expires_at).toBe(Math.floor(NOW.getTime() / 1000) + 3 * 3600);
    // Stripe accepts 30 minutes to 24 hours after creation.
    expect(params.expires_at - NOW.getTime() / 1000).toBeGreaterThanOrEqual(30 * 60);
    expect(params.expires_at - NOW.getTime() / 1000).toBeLessThanOrEqual(24 * 3600);
    expect(params.after_expiration).toEqual({
      recovery: { enabled: true, allow_promotion_codes: true },
    });
  });

  it('mirrors the original promotion-code rule on recovered sessions', () => {
    expect(checkoutExpiryParams({ allowPromotionCodes: false }).after_expiration.recovery)
      .toEqual({ enabled: true, allow_promotion_codes: false });
  });
});

describe('recovery URL safety', () => {
  it('only accepts https Stripe-hosted links', () => {
    expect(safeRecoveryUrl(RECOVERY_URL)).toBe(RECOVERY_URL);
    expect(safeRecoveryUrl('https://checkout.stripe.com/c/pay/cs_x')).toContain('checkout.stripe.com');
    for (const bad of [
      'http://buy.stripe.com/r/x',
      'https://buy.stripe.com.evil.example/r/x',
      'https://evil.example/?stripe.com',
      'javascript:alert(1)',
      'https://user:pw@buy.stripe.com/r/x',
      '',
      null,
    ]) {
      expect(safeRecoveryUrl(bad), String(bad)).toBeNull();
    }
  });

  it('drops a recovery link once Stripe says it has expired', () => {
    const payload = { recovery_url: RECOVERY_URL, recovery_expires_at: '2026-10-01T00:00:00Z' };
    expect(liveRecoveryUrl(payload, Date.parse('2026-09-30T00:00:00Z'))).toBe(RECOVERY_URL);
    expect(liveRecoveryUrl(payload, Date.parse('2026-10-02T00:00:00Z'))).toBeNull();
    expect(liveRecoveryUrl({ recovery_url: RECOVERY_URL }, NOW.getTime())).toBe(RECOVERY_URL);
    expect(liveRecoveryUrl({}, NOW.getTime())).toBeNull();
  });

  it('recovers the upgrade context from the success URL', () => {
    expect(upgradeFromSession(expiredEvent().data.object)).toBe('writing');
    expect(upgradeFromSession({ success_url: 'https://www.ielts-bank.com/pricing?upgrade=evil' })).toBe('');
    expect(upgradeFromSession({})).toBe('');
  });
});

describe('queueCheckoutRecoveryEmail', () => {
  const args = {
    sessionId: 'cs_live_expired',
    sessionCreated: Math.floor(NOW.getTime() / 1000) - 3 * 3600,
    recoveryUrl: RECOVERY_URL,
    recoveryExpiresAt: '2026-10-23T12:00:00.000Z',
    sku: 'exam_pass',
    upgrade: 'writing',
    now: NOW,
  };

  it('queues one checkout_abandoned email carrying the recovery link', async () => {
    const admin = fakeAdmin();
    await expect(queueCheckoutRecoveryEmail(admin, 'user-1', args)).resolves.toBe('recovery email queued');
    const [{ table, row }] = admin.calls.inserts;
    expect(table).toBe('lifecycle_emails');
    expect(row).toEqual({
      user_id: 'user-1',
      recipient_email: 'learner@example.com',
      email_type: 'checkout_abandoned',
      idempotency_key: 'checkout_abandoned:user-1:2026-09-23',
      payload: {
        upgrade: 'writing',
        sku: 'exam_pass',
        session_id: 'cs_live_expired',
        recovery_url: RECOVERY_URL,
        recovery_expires_at: '2026-10-23T12:00:00.000Z',
      },
    });
    expect(admin.calls.filters).toContainEqual(
      expect.objectContaining({ column: 'created_at', op: 'gte', value: '2026-09-16T12:00:00.000Z' })
    );
  });

  it('sends at most one per learner per 7 days', async () => {
    const admin = fakeAdmin({ recent: [{ id: 'earlier' }] });
    await expect(queueCheckoutRecoveryEmail(admin, 'user-1', args))
      .resolves.toBe('recovery email skipped (sent within 7 days)');
    expect(admin.calls.inserts).toHaveLength(0);
  });

  it('never nudges a learner who already has Pro', async () => {
    const admin = fakeAdmin({ user: { email: 'a@b.com', plan: 'premium', plan_status: 'active' } });
    await expect(queueCheckoutRecoveryEmail(admin, 'user-1', args))
      .resolves.toBe('recovery email skipped (already premium)');
    expect(admin.calls.inserts).toHaveLength(0);
  });

  it('skips without a safe recovery link or an email address', async () => {
    await expect(queueCheckoutRecoveryEmail(fakeAdmin(), 'user-1', { ...args, recoveryUrl: 'https://evil.example' }))
      .resolves.toBe('recovery email skipped (no recovery url)');
    await expect(queueCheckoutRecoveryEmail(fakeAdmin({ user: { email: null } }), 'user-1', args))
      .resolves.toBe('recovery email skipped (no email)');
  });

  it('treats a duplicate as already queued and fails soft on errors', async () => {
    await expect(queueCheckoutRecoveryEmail(fakeAdmin({ insertError: { code: '23505' } }), 'user-1', args))
      .resolves.toBe('recovery email already queued');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(queueCheckoutRecoveryEmail(fakeAdmin({ userError: { message: 'db down' } }), 'user-1', args))
      .resolves.toBe('recovery email failed');
    errors.mockRestore();
  });
});

describe('handleStripeEvent checkout.session.expired', () => {
  it('records the expiry and queues the recovery email for the checkout owner', async () => {
    const admin = fakeAdmin();
    const outcome = await handleStripeEvent(expiredEvent(), { admin, stripe: {} });
    expect(outcome).toBe('recorded expired checkout for user user-1 (recovery email queued)');

    const activity = admin.calls.inserts.find((call) => call.table === 'activity_events').row;
    expect(activity).toMatchObject({
      billing_event_id: 'expired:cs_live_expired',
      event: 'checkout_expired',
      user_id: 'user-1',
      props: expect.objectContaining({
        sku: 'exam_pass',
        ppp: '1',
        transaction_id: 'cs_live_expired',
        billing_mode: 'payment',
        recovery_available: true,
      }),
    });
    // The recovery link opens a checkout prefilled with the learner's email:
    // it lives only in the service-role email queue, never in analytics.
    expect(JSON.stringify(activity)).not.toContain('buy.stripe.com');

    const email = admin.calls.inserts.find((call) => call.table === 'lifecycle_emails').row;
    expect(email.payload).toMatchObject({ recovery_url: RECOVERY_URL, sku: 'exam_pass', upgrade: 'writing' });
  });

  it('records a subscription expiry without a recovery link but sends nothing', async () => {
    const admin = fakeAdmin();
    const outcome = await handleStripeEvent(expiredEvent({
      mode: 'subscription',
      metadata: { user_id: 'user-1', sku: 'monthly', ppp: '0' },
      after_expiration: null,
    }), { admin, stripe: {} });
    expect(outcome).toContain('recovery email skipped (no recovery url)');
    expect(admin.calls.inserts.find((call) => call.table === 'activity_events').row.props)
      .toMatchObject({ sku: 'monthly', billing_mode: 'subscription', recovery_available: false });
    expect(admin.calls.inserts.some((call) => call.table === 'lifecycle_emails')).toBe(false);
  });

  it('acknowledges an expiry it cannot map to a learner without retrying', async () => {
    const admin = fakeAdmin({ user: null });
    const outcome = await handleStripeEvent(expiredEvent(), { admin, stripe: {} });
    expect(outcome).toBe('ignored: no user mapping for expired checkout');
    expect(outcome.startsWith('error:')).toBe(false);
    expect(admin.calls.inserts).toHaveLength(0);
  });

  it('keeps the webhook successful when the email queue is unavailable', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const admin = fakeAdmin({ insertError: { code: '42P01', message: 'relation missing' } });
    const outcome = await handleStripeEvent(expiredEvent(), { admin, stripe: {} });
    expect(outcome).toContain('recovery email failed');
    expect(outcome.startsWith('error:')).toBe(false);
    errors.mockRestore();
  });
});

describe('recovered checkout completion', () => {
  const stripe = (original) => ({
    checkout: { sessions: { retrieve: vi.fn(async () => original) } },
    paymentIntents: { retrieve: async (id) => ({ id, status: 'succeeded',
      latest_charge: { id: 'ch_1', payment_intent: id, refunded: false, amount_refunded: 0, disputed: false } }) },
  });
  const completed = (object) => ({
    id: 'evt_completed',
    type: 'checkout.session.completed',
    created: Math.floor(NOW.getTime() / 1000),
    data: { object: {
      id: 'cs_live_recovered', mode: 'payment', payment_status: 'paid', amount_total: 599,
      currency: 'usd', customer: 'cus_123', payment_intent: 'pi_1', recovered_from: 'cs_live_expired',
      created: Math.floor(NOW.getTime() / 1000), ...object,
    } },
  });

  it('records checkout_recovered and tags the purchase with recovered_from', async () => {
    const admin = fakeAdmin();
    const deps = { admin, stripe: stripe(null) };
    const outcome = await handleStripeEvent(completed({
      client_reference_id: 'user-1', metadata: { user_id: 'user-1', sku: 'exam_pass', ppp: '1', pass_days: '30' },
    }), deps);
    expect(outcome).toContain('activated exam pass');
    expect(deps.stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
    const events = admin.calls.inserts.filter((call) => call.table === 'activity_events').map((call) => call.row);
    expect(events.find((row) => row.event === 'purchase_success').props.recovered_from).toBe('cs_live_expired');
    expect(events.find((row) => row.event === 'checkout_recovered')).toMatchObject({
      billing_event_id: 'recovered:cs_live_recovered',
      props: expect.objectContaining({ recovered_from: 'cs_live_expired', sku: 'exam_pass' }),
    });
  });

  it('takes user and plan stamps from the original session when the copy lacks them', async () => {
    const admin = fakeAdmin();
    const original = {
      id: 'cs_live_expired', customer: 'cus_123', client_reference_id: 'user-1',
      metadata: { user_id: 'user-1', sku: 'exam_pass', ppp: '1', pass_days: '45' },
    };
    const outcome = await handleStripeEvent(completed({ metadata: {} }), { admin, stripe: stripe(original) });
    expect(outcome).toContain('activated exam pass user user-1');
    expect(admin.calls.rpcs[0].args.p_fields._exam_pass_days).toBe(45);
  });

  it('refuses to borrow stamps from a different customer\'s session', async () => {
    const admin = fakeAdmin();
    const original = { id: 'cs_live_expired', customer: 'cus_other', client_reference_id: 'user-2',
      metadata: { sku: 'exam_pass' } };
    await expect(handleStripeEvent(completed({ metadata: {} }), { admin, stripe: stripe(original) }))
      .rejects.toThrow('recovered checkout does not match its original session');
    expect(admin.calls.rpcs).toHaveLength(0);
  });
});

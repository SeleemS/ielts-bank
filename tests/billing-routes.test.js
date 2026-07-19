// tests/billing-routes.test.js
// Route-level tests for the Stripe webhook (real signature verification over
// the raw body) and the checkout route (auth / anonymous / PPP mapping).
// Lives outside pages/ so Next.js never serves it as a route.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import Stripe from 'stripe';

const WEBHOOK_SECRET = 'whsec_test_secret_for_vitest';

process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_vitest';
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';

// ---------------------------------------------------------------------------
// Helpers: fake Next.js req/res
// ---------------------------------------------------------------------------
function makeReq({ method = 'POST', headers = {}, body = null, raw = null } = {}) {
  const req = raw ? Readable.from([raw]) : Readable.from([]);
  req.method = method;
  req.headers = headers;
  req.body = body;
  req.socket = { remoteAddress: '127.0.0.1' };
  return req;
}

function makeRes() {
  const res = {
    statusCode: null,
    jsonBody: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
  };
  return res;
}

function signedPayload(event) {
  const payload = JSON.stringify(event);
  const stripe = new Stripe('sk_test_dummy_for_vitest');
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
  return { payload: Buffer.from(payload), signature };
}

// ---------------------------------------------------------------------------
// Webhook route
// ---------------------------------------------------------------------------
describe('POST /api/webhooks/stripe', () => {
  it('rejects non-POST', async () => {
    const { default: handler } = await import('../pages/api/webhooks/stripe');
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('rejects an invalid signature', async () => {
    const { default: handler } = await import('../pages/api/webhooks/stripe');
    const res = makeRes();
    const req = makeReq({
      raw: Buffer.from(JSON.stringify({ type: 'customer.created' })),
      headers: { 'stripe-signature': 't=1,v1=deadbeef' },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toMatch(/signature/i);
  });

  it('accepts a correctly signed event and acknowledges ignored types', async () => {
    const { default: handler } = await import('../pages/api/webhooks/stripe');
    const { payload, signature } = signedPayload({
      id: 'evt_test_1',
      type: 'customer.created',
      data: { object: { id: 'cus_x' } },
    });
    const res = makeRes();
    const req = makeReq({ raw: payload, headers: { 'stripe-signature': signature } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ received: true });
  });

  it('rejects a signed payload that was tampered with after signing', async () => {
    const { default: handler } = await import('../pages/api/webhooks/stripe');
    const { signature } = signedPayload({ id: 'evt_1', type: 'customer.created', data: { object: {} } });
    const tampered = Buffer.from(
      JSON.stringify({ id: 'evt_1', type: 'customer.subscription.deleted', data: { object: {} } })
    );
    const res = makeRes();
    await handler(makeReq({ raw: tampered, headers: { 'stripe-signature': signature } }), res);
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Checkout route (mocked supabase + stripe client)
// ---------------------------------------------------------------------------
const mockState = {
  authUser: null,
  userRow: null,
  retrievedSession: null,
  reconciliationOutcome: 'activated user user-1 (active)',
  stripeCalls: {},
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () =>
        mockState.authUser
          ? { data: { user: mockState.authUser }, error: null }
          : { data: null, error: { message: 'invalid token' } },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            mockState.userRow
              ? { data: mockState.userRow, error: null }
              : { data: null, error: { message: 'not found' } },
        }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

vi.mock('../lib/billing', async (importOriginal) => {
  const actual = await importOriginal();
  const { default: StripeSdk } = await import('stripe');
  // Real signature verification (used by the webhook route) + mocked network calls.
  const realWebhooks = new StripeSdk('sk_test_dummy_for_vitest').webhooks;
  return {
    ...actual,
    getStripe: () => ({
      webhooks: realWebhooks,
      prices: {
        list: async (args) => {
          mockState.stripeCalls.pricesList = args;
          return { data: [{ id: 'price_mock_1', lookup_key: args.lookup_keys[0] }] };
        },
      },
      customers: {
        create: async (args) => {
          mockState.stripeCalls.customerCreate = args;
          return { id: 'cus_mock_1' };
        },
      },
      checkout: {
        sessions: {
          create: async (args) => {
            mockState.stripeCalls.sessionCreate = args;
            return { url: 'https://checkout.stripe.com/c/pay/mock' };
          },
          retrieve: async (id, args) => {
            mockState.stripeCalls.sessionRetrieve = { id, args };
            return mockState.retrievedSession;
          },
        },
      },
    }),
    handleStripeEvent: async (event, deps) => {
      if (
        event.type === 'checkout.session.completed'
        && String(event.id || '').startsWith('verify:')
      ) {
        mockState.stripeCalls.reconciliation = { event, deps };
        return mockState.reconciliationOutcome;
      }
      return actual.handleStripeEvent(event, deps);
    },
  };
});

describe('POST /api/billing/checkout', () => {
  beforeEach(() => {
    mockState.authUser = null;
    mockState.userRow = null;
    mockState.retrievedSession = null;
    mockState.reconciliationOutcome = 'activated user user-1 (active)';
    mockState.stripeCalls = {};
    delete process.env.STRIPE_AUTOMATIC_TAX;
    delete process.env.STRIPE_WINBACK_COUPON_ID;
  });

  async function callCheckout({ headers = {}, body = { sku: 'monthly' } } = {}) {
    const { default: handler } = await import('../pages/api/billing/checkout');
    const res = makeRes();
    await handler(makeReq({ headers, body }), res);
    return res;
  }

  it('rejects unauthenticated requests', async () => {
    const res = await callCheckout();
    expect(res.statusCode).toBe(401);
  });

  it('rejects unknown SKUs', async () => {
    mockState.authUser = { id: 'user-1' };
    const res = await callCheckout({
      headers: { authorization: 'Bearer tok' },
      body: { sku: 'lifetime' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects anonymous accounts with a linkable error code', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = { id: 'user-1', email: null, is_anonymous: true, plan: 'free' };
    const res = await callCheckout({ headers: { authorization: 'Bearer tok' } });
    expect(res.statusCode).toBe(403);
    expect(res.jsonBody.code).toBe('anonymous_user');
  });

  it('rejects users who already have premium', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'premium',
      plan_status: 'active',
    };
    const res = await callCheckout({ headers: { authorization: 'Bearer tok' } });
    expect(res.statusCode).toBe(409);
  });

  it('creates a checkout session with the global price by default', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = { id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free' };
    const res = await callCheckout({ headers: { authorization: 'Bearer tok' } });
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.url).toContain('checkout.stripe.com');
    expect(mockState.stripeCalls.pricesList.lookup_keys).toEqual(['premium_monthly']);
    const session = mockState.stripeCalls.sessionCreate;
    expect(session.mode).toBe('subscription');
    expect(session.client_reference_id).toBe('user-1');
    expect(session.allow_promotion_codes).toBe(true);
    expect(session.payment_method_collection).toBe('if_required');
    expect(session.subscription_data.metadata.user_id).toBe('user-1');
    expect(session.automatic_tax).toBeUndefined();
  });

  it('selects the PPP price from request geo, never from the client body', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = { id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free' };
    const res = await callCheckout({
      headers: { authorization: 'Bearer tok', 'x-vercel-ip-country': 'IN' },
      body: { sku: '6month' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockState.stripeCalls.pricesList.lookup_keys).toEqual(['premium_6month_ppp']);
    expect(mockState.stripeCalls.sessionCreate.subscription_data.metadata.ppp).toBe('1');
  });

  it('reuses an existing stripe customer instead of creating a new one', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'free',
      stripe_customer_id: 'cus_existing',
    };
    await callCheckout({ headers: { authorization: 'Bearer tok' } });
    expect(mockState.stripeCalls.customerCreate).toBeUndefined();
    expect(mockState.stripeCalls.sessionCreate.customer).toBe('cus_existing');
  });

  it('creates a non-renewing PPP Exam Pass payment with payment metadata', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'free',
      stripe_customer_id: 'cus_existing',
    };
    const res = await callCheckout({
      headers: { authorization: 'Bearer tok', 'x-vercel-ip-country': 'IN' },
      body: { sku: 'exam_pass' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockState.stripeCalls.pricesList.lookup_keys).toEqual(['premium_exam_pass_ppp']);
    const session = mockState.stripeCalls.sessionCreate;
    expect(session.mode).toBe('payment');
    expect(session.subscription_data).toBeUndefined();
    expect(session.payment_intent_data.metadata).toEqual({
      user_id: 'user-1',
      sku: 'exam_pass',
      ppp: '1',
    });
  });

  it('rejects a win-back offer before the 30-day eligibility window', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'free',
      canceled_at: new Date(Date.now() - 29 * 86400000).toISOString(),
    };
    const res = await callCheckout({
      headers: { authorization: 'Bearer tok' },
      body: { sku: 'monthly', offer: 'winback' },
    });
    expect(res.statusCode).toBe(403);
    expect(mockState.stripeCalls.pricesList).toBeUndefined();
  });

  it('fails closed when an eligible win-back coupon is not configured', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'free',
      canceled_at: new Date(Date.now() - 31 * 86400000).toISOString(),
    };
    const res = await callCheckout({
      headers: { authorization: 'Bearer tok' },
      body: { sku: 'monthly', offer: 'winback' },
    });
    expect(res.statusCode).toBe(503);
    expect(mockState.stripeCalls.sessionCreate).toBeUndefined();
  });

  it('applies only the configured coupon to an eligible monthly win-back checkout', async () => {
    process.env.STRIPE_WINBACK_COUPON_ID = 'IELTSBANK_WINBACK40';
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'free',
      canceled_at: new Date(Date.now() - 31 * 86400000).toISOString(),
    };
    const res = await callCheckout({
      headers: { authorization: 'Bearer tok' },
      body: { sku: 'monthly', offer: 'winback' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockState.stripeCalls.sessionCreate.allow_promotion_codes).toBe(false);
    expect(mockState.stripeCalls.sessionCreate.discounts).toEqual([
      { coupon: 'IELTSBANK_WINBACK40' },
    ]);
  });

  it('enables automatic Tax only when the production setting is explicitly on', async () => {
    process.env.STRIPE_AUTOMATIC_TAX = '1';
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'free',
    };
    const res = await callCheckout({ headers: { authorization: 'Bearer tok' } });
    expect(res.statusCode).toBe(200);
    expect(mockState.stripeCalls.sessionCreate.automatic_tax).toEqual({ enabled: true });
  });
});

describe('POST /api/billing/verify-session', () => {
  beforeEach(() => {
    mockState.authUser = null;
    mockState.userRow = null;
    mockState.retrievedSession = null;
    mockState.reconciliationOutcome = 'activated user user-1 (active)';
    mockState.stripeCalls = {};
  });

  async function callVerify({ headers = {}, body = {} } = {}) {
    const { default: handler } = await import('../pages/api/billing/verify-session');
    const res = makeRes();
    await handler(makeReq({ headers, body }), res);
    return res;
  }

  it('rejects unauthenticated and malformed reconciliation requests', async () => {
    let res = await callVerify({ body: { session_id: 'cs_live_valid' } });
    expect(res.statusCode).toBe(401);

    mockState.authUser = { id: 'user-1' };
    res = await callVerify({
      headers: { authorization: 'Bearer tok' },
      body: { session_id: 'not-a-checkout-session' },
    });
    expect(res.statusCode).toBe(400);
    expect(mockState.stripeCalls.sessionRetrieve).toBeUndefined();
  });

  it('rejects a completed checkout belonging to another account', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.retrievedSession = {
      id: 'cs_live_other',
      client_reference_id: 'user-2',
      metadata: {},
      status: 'complete',
      payment_status: 'paid',
    };
    const res = await callVerify({
      headers: { authorization: 'Bearer tok' },
      body: { session_id: 'cs_live_other' },
    });
    expect(res.statusCode).toBe(403);
    expect(mockState.stripeCalls.reconciliation).toBeUndefined();
  });

  it('waits rather than granting access for an incomplete payment', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.retrievedSession = {
      id: 'cs_live_open',
      client_reference_id: 'user-1',
      metadata: {},
      status: 'open',
      payment_status: 'unpaid',
    };
    const res = await callVerify({
      headers: { authorization: 'Bearer tok' },
      body: { session_id: 'cs_live_open' },
    });
    expect(res.statusCode).toBe(409);
    expect(mockState.stripeCalls.reconciliation).toBeUndefined();
  });

  it('reuses the webhook activation path for a paid owned checkout', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.retrievedSession = {
      id: 'cs_live_paid',
      client_reference_id: 'user-1',
      metadata: { user_id: 'user-1' },
      status: 'complete',
      payment_status: 'paid',
    };
    const res = await callVerify({
      headers: { authorization: 'Bearer tok' },
      body: { session_id: 'cs_live_paid' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.active).toBe(true);
    expect(mockState.stripeCalls.sessionRetrieve).toEqual({
      id: 'cs_live_paid',
      args: { expand: ['subscription'] },
    });
    expect(mockState.stripeCalls.reconciliation.event.id).toBe('verify:cs_live_paid');
  });
});

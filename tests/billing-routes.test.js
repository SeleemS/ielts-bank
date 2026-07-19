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
        },
      },
    }),
  };
});

describe('POST /api/billing/checkout', () => {
  beforeEach(() => {
    mockState.authUser = null;
    mockState.userRow = null;
    mockState.stripeCalls = {};
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
});

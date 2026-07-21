import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';
process.env.STRIPE_PORTAL_CONFIGURATION_ID = 'bpc_test';

const state = {
  authUser: { id: 'user-1' },
  authError: null,
  authReject: null,
  userRow: { stripe_customer_id: 'cus_test' },
  userError: null,
  userReject: null,
  rateLimit: true,
  rateLimitError: null,
  rateLimitReject: null,
  rpcCalls: [],
  customer: { id: 'cus_test', metadata: { user_id: 'user-1' } },
  customerError: null,
  customerCalls: [],
  portalError: null,
  portalCalls: [],
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => {
        if (state.authReject) throw state.authReject;
        return state.authUser
          ? { data: { user: state.authUser }, error: state.authError }
          : { data: null, error: state.authError || { message: 'invalid token' } };
      },
    },
    rpc: async (name, args) => {
      state.rpcCalls.push({ name, args });
      if (state.rateLimitReject) throw state.rateLimitReject;
      return { data: state.rateLimit, error: state.rateLimitError };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (state.userReject) throw state.userReject;
            return { data: state.userRow, error: state.userError };
          },
        }),
      }),
    }),
  }),
}));

vi.mock('../lib/billing', () => ({
  getStripe: () => ({
    customers: {
      retrieve: async (customerId) => {
        state.customerCalls.push(customerId);
        if (state.customerError) throw state.customerError;
        return state.customer;
      },
    },
    billingPortal: {
      sessions: {
        create: async (input) => {
          state.portalCalls.push(input);
          if (state.portalError) throw state.portalError;
          return { url: 'https://billing.stripe.com/p/session/test' };
        },
      },
    },
  }),
}));

function makeReq({
  method = 'POST',
  origin = 'https://www.ielts-bank.com',
  authorization = 'Bearer token',
} = {}) {
  return {
    method,
    headers: { origin, authorization },
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function makeRes() {
  return {
    statusCode: null,
    jsonBody: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      return this;
    },
  };
}

async function callPortal(options) {
  const { default: handler } = await import('../pages/api/billing/portal');
  const res = makeRes();
  await handler(makeReq(options), res);
  return res;
}

describe('POST /api/billing/portal', () => {
  beforeEach(() => {
    state.authUser = { id: 'user-1' };
    state.authError = null;
    state.authReject = null;
    state.userRow = { stripe_customer_id: 'cus_test' };
    state.userError = null;
    state.userReject = null;
    state.rateLimit = true;
    state.rateLimitError = null;
    state.rateLimitReject = null;
    state.rpcCalls = [];
    state.customer = { id: 'cus_test', metadata: { user_id: 'user-1' } };
    state.customerError = null;
    state.customerCalls = [];
    state.portalError = null;
    state.portalCalls = [];
    vi.restoreAllMocks();
  });

  it('allows only same-origin POST requests', async () => {
    let res = await callPortal({ method: 'GET' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');

    res = await callPortal({ origin: 'https://attacker.example' });
    expect(res.statusCode).toBe(403);
    expect(state.portalCalls).toEqual([]);
  });

  it('refuses to expose a customer owned by another learner', async () => {
    state.customer = { id: 'cus_test', metadata: { user_id: 'user-2' } };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callPortal();

    expect(res.statusCode).toBe(409);
    expect(res.jsonBody.code).toBe('billing_account_mismatch');
    expect(state.customerCalls).toEqual(['cus_test']);
    expect(state.portalCalls).toEqual([]);
  });

  it('refuses a customer without an explicit Stripe ownership mapping', async () => {
    state.customer = { id: 'cus_test', metadata: {} };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callPortal();

    expect(res.statusCode).toBe(409);
    expect(res.jsonBody.code).toBe('billing_account_mismatch');
    expect(state.portalCalls).toEqual([]);
  });

  it('refuses a deleted Stripe customer', async () => {
    state.customer = { id: 'cus_test', deleted: true };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callPortal();

    expect(res.statusCode).toBe(409);
    expect(res.jsonBody.code).toBe('billing_account_mismatch');
    expect(state.portalCalls).toEqual([]);
  });

  it('reports a missing Stripe customer as a billing-account mismatch', async () => {
    state.customerError = Object.assign(new Error('No such customer'), {
      code: 'resource_missing',
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callPortal();

    expect(res.statusCode).toBe(409);
    expect(res.jsonBody.code).toBe('billing_account_mismatch');
    expect(state.portalCalls).toEqual([]);
  });

  it('returns a retryable error when Stripe customer verification is unavailable', async () => {
    state.customerError = new Error('stripe unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callPortal();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/try again/i);
    expect(state.portalCalls).toEqual([]);
  });

  it('requires an authenticated user', async () => {
    const res = await callPortal({ authorization: '' });

    expect(res.statusCode).toBe(401);
    expect(state.portalCalls).toEqual([]);
  });

  it('treats an invalid access token as unauthenticated', async () => {
    state.authUser = null;
    const res = await callPortal();

    expect(res.statusCode).toBe(401);
    expect(state.portalCalls).toEqual([]);
  });

  it('returns a retryable service error when auth verification rejects', async () => {
    state.authReject = new Error('auth service unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callPortal();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/try again/i);
    expect(state.portalCalls).toEqual([]);
  });

  it('does not misreport a resolved database error as no billing account', async () => {
    state.userRow = null;
    state.userError = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callPortal();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/verify your billing account/i);
    expect(state.portalCalls).toEqual([]);
  });

  it('recovers when the billing-account query rejects', async () => {
    state.userReject = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callPortal();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/try again/i);
    expect(state.portalCalls).toEqual([]);
  });

  it('reports a verified user with no Stripe customer as not yet billed', async () => {
    state.userRow = null;
    const res = await callPortal();

    expect(res.statusCode).toBe(404);
    expect(res.jsonBody.error).toMatch(/no billing account/i);
    expect(state.rpcCalls).toEqual([]);
    expect(state.portalCalls).toEqual([]);
  });

  it('rate-limits repeated portal requests before any Stripe call', async () => {
    state.rateLimit = false;

    const res = await callPortal();

    expect(res.statusCode).toBe(429);
    expect(res.jsonBody.error).toMatch(/too many billing portal requests/i);
    expect(state.rpcCalls).toEqual([
      {
        name: 'check_rate_limit',
        args: {
          p_bucket: 'billing-portal',
          p_identifier: 'user-1',
          p_window_seconds: 600,
          p_max: 10,
        },
      },
    ]);
    expect(state.portalCalls).toEqual([]);
  });

  it('fails closed when the portal limiter returns an error', async () => {
    state.rateLimitError = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callPortal();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/try again/i);
    expect(state.portalCalls).toEqual([]);
  });

  it('fails closed when the portal limiter rejects', async () => {
    state.rateLimitReject = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callPortal();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/try again/i);
    expect(state.portalCalls).toEqual([]);
  });

  it('creates a customer portal session for the verified billing account', async () => {
    const res = await callPortal();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.url).toBe('https://billing.stripe.com/p/session/test');
    expect(state.rpcCalls).toEqual([
      {
        name: 'check_rate_limit',
        args: {
          p_bucket: 'billing-portal',
          p_identifier: 'user-1',
          p_window_seconds: 600,
          p_max: 10,
        },
      },
    ]);
    expect(state.portalCalls).toEqual([
      {
        customer: 'cus_test',
        configuration: 'bpc_test',
        return_url: 'https://www.ielts-bank.com/billing/manage',
      },
    ]);
    expect(state.customerCalls).toEqual(['cus_test']);
  });

  it('returns a recoverable error when Stripe cannot open the portal', async () => {
    state.portalError = new Error('stripe unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callPortal();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/try again/i);
  });
});

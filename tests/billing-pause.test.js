import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';

const state = {
  authUser: { id: 'user-1' },
  authError: null,
  authReject: null,
  userRow: null,
  userError: null,
  userReject: null,
  rateLimit: true,
  rateLimitError: null,
  rateLimitReject: null,
  rpcCalls: [],
  userUpdates: [],
  stripeUpdates: [],
  claimAvailable: true,
  claimError: null,
  claimReject: null,
  rollbackReject: null,
  detailError: null,
  detailReject: null,
  eventReject: null,
  stripeError: null,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => {
        if (state.authReject) throw state.authReject;
        return state.authUser
          ? { data: { user: state.authUser }, error: state.authError }
          : {
              data: null,
              error: state.authError || { message: 'invalid token' },
            };
      },
    },
    rpc: async (name, args) => {
      state.rpcCalls.push({ name, args });
      if (state.rateLimitReject) throw state.rateLimitReject;
      return { data: state.rateLimit, error: state.rateLimitError };
    },
    from: (table) => ({
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: async () => {
            if (state.userReject) throw state.userReject;
            return { data: state.userRow, error: state.userError };
          },
        };
        return chain;
      },
      update: (fields) => {
        const filters = [];
        const operation = { table, fields, filters };
        state.userUpdates.push(operation);
        const chain = {
          eq: (field, value) => {
            filters.push({ type: 'eq', field, value });
            return chain;
          },
          is: (field, value) => {
            filters.push({ type: 'is', field, value });
            return chain;
          },
          select: () => chain,
          maybeSingle: async () => {
            const isClaim =
              fields.billing_pause_used_at != null
              && Object.keys(fields).length === 1;
            const isDetail = fields.billing_pause_until != null;
            const isRollback =
              fields.billing_pause_used_at === null
              && Object.keys(fields).length === 1;
            if (isClaim) {
              if (state.claimReject) throw state.claimReject;
              return {
                data: state.claimAvailable ? { id: 'user-1' } : null,
                error: state.claimError,
              };
            }
            if (isDetail) {
              if (state.detailReject) throw state.detailReject;
              return {
                data: state.detailError ? null : { id: 'user-1' },
                error: state.detailError,
              };
            }
            if (isRollback && state.rollbackReject) throw state.rollbackReject;
            return { data: { id: 'user-1' }, error: null };
          },
        };
        return chain;
      },
      insert: async () => {
        if (state.eventReject) throw state.eventReject;
        return { error: null };
      },
    }),
  }),
}));

vi.mock('../lib/billing', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getStripe: () => ({
      subscriptions: {
        update: async (id, fields) => {
          state.stripeUpdates.push({ id, fields });
          if (state.stripeError) throw state.stripeError;
          return { id };
        },
      },
    }),
  };
});

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

function makeReq({
  method = 'POST',
  origin = 'https://www.ielts-bank.com',
  authorization = 'Bearer token',
} = {}) {
  return {
    method,
    headers: {
      origin,
      authorization,
    },
    socket: { remoteAddress: '127.0.0.1' },
  };
}

async function callPause(options) {
  const { default: handler } = await import('../pages/api/billing/pause');
  const res = makeRes();
  await handler(makeReq(options), res);
  return res;
}

describe('POST /api/billing/pause', () => {
  beforeEach(() => {
    state.authUser = { id: 'user-1' };
    state.authError = null;
    state.authReject = null;
    state.userRow = {
      stripe_subscription_id: 'sub_123',
      plan: 'premium',
      plan_status: 'active',
      plan_renews_at: '2026-08-19T12:00:00.000Z',
      plan_expires_at: null,
      billing_pause_until: null,
      billing_pause_used_at: null,
    };
    state.userError = null;
    state.userReject = null;
    state.rateLimit = true;
    state.rateLimitError = null;
    state.rateLimitReject = null;
    state.rpcCalls = [];
    state.userUpdates = [];
    state.stripeUpdates = [];
    state.claimAvailable = true;
    state.claimError = null;
    state.claimReject = null;
    state.rollbackReject = null;
    state.detailError = null;
    state.detailReject = null;
    state.eventReject = null;
    state.stripeError = null;
    vi.restoreAllMocks();
  });

  it('allows only same-origin POST requests', async () => {
    let res = await callPause({ method: 'GET' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');

    res = await callPause({ origin: 'https://attacker.example' });
    expect(res.statusCode).toBe(403);
    expect(state.rpcCalls).toEqual([]);
    expect(state.userUpdates).toEqual([]);
    expect(state.stripeUpdates).toEqual([]);
  });

  it('requires an authenticated user', async () => {
    const res = await callPause({ authorization: '' });

    expect(res.statusCode).toBe(401);
    expect(state.rpcCalls).toEqual([]);
    expect(state.userUpdates).toEqual([]);
    expect(state.stripeUpdates).toEqual([]);
  });

  it('returns a retryable service error when auth verification rejects', async () => {
    state.authReject = new Error('auth service unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callPause();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/verify your subscription/i);
    expect(state.stripeUpdates).toEqual([]);
    expect(state.userUpdates).toEqual([]);
  });

  it('does not misreport a resolved subscription-query failure as inactive', async () => {
    state.userRow = null;
    state.userError = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callPause();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/try again/i);
    expect(state.stripeUpdates).toEqual([]);
    expect(state.userUpdates).toEqual([]);
  });

  it('recovers when the subscription query rejects', async () => {
    state.userReject = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callPause();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/try again/i);
    expect(state.stripeUpdates).toEqual([]);
    expect(state.userUpdates).toEqual([]);
  });

  it('keeps a verified missing subscription distinct from dependency failure', async () => {
    state.userRow = null;
    const res = await callPause();

    expect(res.statusCode).toBe(409);
    expect(res.jsonBody.error).toMatch(/no active subscription/i);
    expect(state.rpcCalls).toEqual([]);
    expect(state.stripeUpdates).toEqual([]);
    expect(state.userUpdates).toEqual([]);
  });

  it('sets a 30-day Stripe pause and permanently records that the offer was used', async () => {
    const res = await callPause();

    expect(res.statusCode).toBe(200);
    expect(state.rpcCalls).toEqual([
      {
        name: 'check_rate_limit',
        args: {
          p_bucket: 'billing-pause',
          p_identifier: 'user-1',
          p_window_seconds: 600,
          p_max: 5,
        },
      },
    ]);
    expect(state.stripeUpdates).toHaveLength(1);
    expect(state.stripeUpdates[0].fields.pause_collection.behavior).toBe('void');
    expect(state.userUpdates[0].fields.billing_pause_used_at).toBeTruthy();
    expect(state.userUpdates[1].fields.billing_pause_until).toBeTruthy();
    expect(res.jsonBody.reconciling).toBe(false);
  });

  it('rejects a second pause without calling Stripe', async () => {
    state.userRow.billing_pause_used_at = '2026-06-01T12:00:00.000Z';
    const res = await callPause();

    expect(res.statusCode).toBe(409);
    expect(res.jsonBody.error).toMatch(/already been used/i);
    expect(state.rpcCalls).toEqual([]);
    expect(state.stripeUpdates).toEqual([]);
  });

  it('rate-limits repeated pause attempts before a claim or Stripe call', async () => {
    state.rateLimit = false;

    const res = await callPause();

    expect(res.statusCode).toBe(429);
    expect(res.jsonBody.error).toMatch(/too many billing pause attempts/i);
    expect(state.rpcCalls).toEqual([
      {
        name: 'check_rate_limit',
        args: {
          p_bucket: 'billing-pause',
          p_identifier: 'user-1',
          p_window_seconds: 600,
          p_max: 5,
        },
      },
    ]);
    expect(state.userUpdates).toEqual([]);
    expect(state.stripeUpdates).toEqual([]);
  });

  it('fails closed when the pause limiter returns an error', async () => {
    state.rateLimitError = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callPause();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/try again/i);
    expect(state.userUpdates).toEqual([]);
    expect(state.stripeUpdates).toEqual([]);
  });

  it('fails closed when the pause limiter rejects', async () => {
    state.rateLimitReject = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callPause();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/try again/i);
    expect(state.userUpdates).toEqual([]);
    expect(state.stripeUpdates).toEqual([]);
  });

  it('allows only one concurrent request to claim the one-time pause', async () => {
    state.claimAvailable = false;
    const res = await callPause();

    expect(res.statusCode).toBe(409);
    expect(res.jsonBody.error).toMatch(/already been used/i);
    expect(state.stripeUpdates).toEqual([]);
    expect(state.userUpdates[0].filters).toContainEqual({
      type: 'is',
      field: 'billing_pause_used_at',
      value: null,
    });
  });

  it('recovers when the one-time claim promise rejects before Stripe', async () => {
    state.claimReject = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callPause();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/try again/i);
    expect(state.stripeUpdates).toEqual([]);
  });

  it('releases the exact claim when Stripe fails before changing the subscription', async () => {
    state.stripeError = new Error('stripe unavailable');
    const res = await callPause();

    expect(res.statusCode).toBe(503);
    expect(state.userUpdates).toHaveLength(2);
    expect(state.userUpdates[1].fields).toEqual({
      billing_pause_used_at: null,
    });
    expect(state.userUpdates[1].filters).toEqual([
      { type: 'eq', field: 'id', value: 'user-1' },
      {
        type: 'eq',
        field: 'billing_pause_used_at',
        value: state.userUpdates[0].fields.billing_pause_used_at,
      },
    ]);
  });

  it('reports a stuck claim truthfully when its rollback rejects', async () => {
    state.stripeError = new Error('stripe unavailable');
    state.rollbackReject = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callPause();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/contact support/i);
    expect(state.userUpdates).toHaveLength(2);
  });

  it('keeps the one-time claim and reports reconciliation after Stripe succeeds', async () => {
    state.detailError = new Error('database temporarily unavailable');
    const res = await callPause();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toMatchObject({
      paused: true,
      reconciling: true,
    });
    expect(state.stripeUpdates).toHaveLength(1);
    expect(
      state.userUpdates.some(
        (update) => update.fields.billing_pause_used_at === null
      )
    ).toBe(false);
  });

  it('keeps truthful success when pause-detail persistence rejects', async () => {
    state.detailReject = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callPause();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toMatchObject({
      paused: true,
      reconciling: true,
    });
    expect(state.stripeUpdates).toHaveLength(1);
  });

  it('keeps truthful success when activity logging rejects', async () => {
    state.eventReject = new Error('logging unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callPause();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toMatchObject({
      paused: true,
      reconciling: false,
    });
    expect(state.stripeUpdates).toHaveLength(1);
  });

  it('rejects an expired or otherwise inactive entitlement', async () => {
    state.userRow.plan_expires_at = '2026-01-01T00:00:00.000Z';
    const res = await callPause();

    expect(res.statusCode).toBe(409);
    expect(state.stripeUpdates).toEqual([]);
  });

  it('rejects a pause after cancellation is scheduled', async () => {
    state.userRow.plan_status = 'canceled';
    const res = await callPause();

    expect(res.statusCode).toBe(409);
    expect(res.jsonBody.error).toMatch(/no active subscription/i);
    expect(state.stripeUpdates).toEqual([]);
  });
});

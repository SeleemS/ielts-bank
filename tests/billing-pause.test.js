import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';

const state = {
  authUser: { id: 'user-1' },
  userRow: null,
  userUpdates: [],
  stripeUpdates: [],
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () =>
        state.authUser
          ? { data: { user: state.authUser }, error: null }
          : { data: null, error: { message: 'invalid token' } },
    },
    from: (table) => ({
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: async () => ({ data: state.userRow, error: null }),
        };
        return chain;
      },
      update: (fields) => ({
        eq: async () => {
          state.userUpdates.push({ table, fields });
          return { error: null };
        },
      }),
      insert: async () => ({ error: null }),
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

async function callPause() {
  const { default: handler } = await import('../pages/api/billing/pause');
  const req = {
    method: 'POST',
    headers: {
      origin: 'https://www.ielts-bank.com',
      authorization: 'Bearer token',
    },
    socket: { remoteAddress: '127.0.0.1' },
  };
  const res = makeRes();
  await handler(req, res);
  return res;
}

describe('POST /api/billing/pause', () => {
  beforeEach(() => {
    state.authUser = { id: 'user-1' };
    state.userRow = {
      stripe_subscription_id: 'sub_123',
      plan: 'premium',
      plan_status: 'active',
      plan_renews_at: '2026-08-19T12:00:00.000Z',
      plan_expires_at: null,
      billing_pause_until: null,
      billing_pause_used_at: null,
    };
    state.userUpdates = [];
    state.stripeUpdates = [];
  });

  it('sets a 30-day Stripe pause and permanently records that the offer was used', async () => {
    const res = await callPause();

    expect(res.statusCode).toBe(200);
    expect(state.stripeUpdates).toHaveLength(1);
    expect(state.stripeUpdates[0].fields.pause_collection.behavior).toBe('void');
    expect(state.userUpdates[0].fields.billing_pause_until).toBeTruthy();
    expect(state.userUpdates[0].fields.billing_pause_used_at).toBeTruthy();
  });

  it('rejects a second pause without calling Stripe', async () => {
    state.userRow.billing_pause_used_at = '2026-06-01T12:00:00.000Z';
    const res = await callPause();

    expect(res.statusCode).toBe(409);
    expect(res.jsonBody.error).toMatch(/already been used/i);
    expect(state.stripeUpdates).toEqual([]);
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

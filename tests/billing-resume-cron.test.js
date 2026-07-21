import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.CRON_SECRET = 'cron-test';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';

const state = {
  dueRows: [],
  lookupError: null,
  lookupReject: null,
  userUpdates: [],
  userUpdateError: null,
  activityInserts: [],
  subscriptions: {},
  retrieveError: null,
  rawRequests: [],
  resumeResult: null,
  resumeError: null,
  metadataUpdates: [],
  metadataError: null,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table) {
      if (table === 'users') {
        return {
          select() {
            const filters = [];
            const chain = {
              eq(field, value) {
                filters.push({ type: 'eq', field, value });
                return chain;
              },
              lte(field, value) {
                filters.push({ type: 'lte', field, value });
                return chain;
              },
              not(field, operator, value) {
                filters.push({ type: 'not', field, operator, value });
                return chain;
              },
              order() {
                return chain;
              },
              async limit(value) {
                if (state.lookupReject) throw state.lookupReject;
                return {
                  data: state.dueRows,
                  error: state.lookupError,
                  filters,
                  limit: value,
                };
              },
            };
            return chain;
          },
          update(fields) {
            return {
              async eq(field, value) {
                state.userUpdates.push({ fields, field, value });
                return { error: state.userUpdateError };
              },
            };
          },
        };
      }
      if (table === 'activity_events') {
        return {
          async insert(row) {
            state.activityInserts.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

vi.mock('../lib/billing', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getStripe: () => ({
      subscriptions: {
        async retrieve(id) {
          if (state.retrieveError) throw state.retrieveError;
          return state.subscriptions[id];
        },
        async update(id, fields) {
          state.metadataUpdates.push({ id, fields });
          if (state.metadataError) throw state.metadataError;
          return {
            ...state.subscriptions[id],
            status: 'active',
            metadata: { user_id: 'user-1' },
          };
        },
      },
      async rawRequest(method, path, params, options) {
        state.rawRequests.push({ method, path, params, options });
        if (state.resumeError) throw state.resumeError;
        return state.resumeResult;
      },
    }),
  };
});

import handler from '../pages/api/cron/resume-billing';

function subscription(status = 'paused', id = 'sub_1') {
  return {
    id,
    customer: 'cus_1',
    status,
    created: 1760000000,
    current_period_end: 1800000000,
    metadata: {
      user_id: 'user-1',
      ielts_pause_resumes_at: '1800000000',
    },
    items: {
      data: [{ price: { lookup_key: 'premium_monthly' } }],
    },
  };
}

function makeReq({ method = 'GET', authorization = 'Bearer cron-test' } = {}) {
  return { method, headers: authorization ? { authorization } : {} };
}

function makeRes() {
  return {
    statusCode: null,
    jsonBody: null,
    headers: {},
    ended: false,
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
    end() {
      this.ended = true;
      return this;
    },
  };
}

async function callRoute(options) {
  const res = makeRes();
  await handler(makeReq(options), res);
  return res;
}

describe('GET /api/cron/resume-billing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.CRON_SECRET = 'cron-test';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';
    state.dueRows = [];
    state.lookupError = null;
    state.lookupReject = null;
    state.userUpdates = [];
    state.userUpdateError = null;
    state.activityInserts = [];
    state.subscriptions = {};
    state.retrieveError = null;
    state.rawRequests = [];
    state.resumeResult = null;
    state.resumeError = null;
    state.metadataUpdates = [];
    state.metadataError = null;
  });

  it('requires GET and the configured cron bearer before dependencies', async () => {
    const wrongMethod = await callRoute({ method: 'POST' });
    const unsigned = await callRoute({ authorization: null });

    expect(wrongMethod.statusCode).toBe(405);
    expect(wrongMethod.headers.Allow).toBe('GET');
    expect(unsigned.statusCode).toBe(401);
  });

  it('returns a zero-count success when no pause is due', async () => {
    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({
      ok: true,
      due: 0,
      resumed: 0,
      reconciled: 0,
      pending: 0,
      failed: 0,
    });
    expect(state.rawRequests).toEqual([]);
  });

  it('resumes a due true pause, clears metadata, and restores the app row', async () => {
    state.dueRows = [{
      id: 'user-1',
      stripe_subscription_id: 'sub_1',
      billing_pause_until: '2026-08-20T00:00:00.000Z',
    }];
    state.subscriptions.sub_1 = subscription('paused');
    state.resumeResult = subscription('active');

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toMatchObject({ ok: true, due: 1, resumed: 1, failed: 0 });
    expect(state.rawRequests).toEqual([
      {
        method: 'POST',
        path: '/v1/subscriptions/sub_1/resume',
        params: {
          payment_behavior: 'resume_on_payment_success',
          billing_cycle_anchor: 'now',
          proration_behavior: 'create_prorations',
        },
        options: { apiVersion: '2026-06-24.preview' },
      },
    ]);
    expect(state.metadataUpdates).toEqual([
      {
        id: 'sub_1',
        fields: { metadata: { ielts_pause_resumes_at: '' } },
      },
    ]);
    expect(state.userUpdates[0].fields).toMatchObject({
      plan: 'premium',
      plan_status: 'active',
      billing_pause_until: null,
    });
    expect(state.activityInserts[0]).toMatchObject({
      user_id: 'user-1',
      event: 'subscription_resumed',
    });
  });

  it('retains a failed-payment pause for the next retry', async () => {
    state.dueRows = [{
      id: 'user-1',
      stripe_subscription_id: 'sub_1',
      billing_pause_until: '2026-08-20T00:00:00.000Z',
    }];
    state.subscriptions.sub_1 = subscription('paused');
    state.resumeResult = subscription('paused');

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toMatchObject({ pending: 1, resumed: 0, failed: 0 });
    expect(state.userUpdates).toEqual([]);
    expect(state.metadataUpdates).toEqual([]);
  });

  it('reconciles a terminal provider state instead of retrying forever', async () => {
    state.dueRows = [{
      id: 'user-1',
      stripe_subscription_id: 'sub_1',
      billing_pause_until: '2026-08-20T00:00:00.000Z',
    }];
    state.subscriptions.sub_1 = subscription('canceled');

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toMatchObject({ reconciled: 1, resumed: 0, failed: 0 });
    expect(state.rawRequests).toEqual([]);
    expect(state.userUpdates[0].fields).toMatchObject({
      plan: 'free',
      plan_status: 'canceled',
      billing_pause_until: null,
    });
  });

  it('reports dependency failures without claiming a resume', async () => {
    state.dueRows = [{
      id: 'user-1',
      stripe_subscription_id: 'sub_1',
      billing_pause_until: '2026-08-20T00:00:00.000Z',
    }];
    state.subscriptions.sub_1 = subscription('paused');
    state.resumeError = new Error('Stripe unavailable');

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toMatchObject({ ok: false, failed: 1, resumed: 0 });
    expect(state.userUpdates).toEqual([]);
  });

  it('fails closed when the due-row query fails', async () => {
    state.lookupError = new Error('database unavailable');

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/find subscriptions due/i);
    expect(state.rawRequests).toEqual([]);
  });
});

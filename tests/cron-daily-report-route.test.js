import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'CRON_SECRET',
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'REPORT_EMAIL',
];
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]])
);

const state = {
  clientCreations: 0,
  fromCalls: [],
  selectCalls: [],
  signups: [],
  signupsError: null,
  totalUsers: 0,
  totalUsersError: null,
  paidUsers: [],
  paidUsersError: null,
  events: [],
  eventsError: null,
  billingEvents: [],
  billingEventsError: null,
  attempts: [],
  attemptsError: null,
  aiCosts: [],
  aiCostsError: null,
  retentionResponse: {
    data: [{ visitors: 0, returning_visitors: 0 }],
    error: null,
  },
  retentionReject: null,
  rpcCalls: [],
  history: [],
  historyError: null,
  upsertError: null,
  upsertReject: null,
  upsertCalls: [],
};

function resultQuery(result) {
  const query = {
    gte: () => query,
    lt: () => query,
    eq: () => query,
    in: () => query,
    order: () => Promise.resolve(result),
    limit: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    state.clientCreations += 1;
    return {
      from(table) {
        state.fromCalls.push(table);
        if (table === 'users') {
          return {
            select(columns, options) {
              state.selectCalls.push({ table, columns, options });
              if (options?.head) {
                return resultQuery({
                  data: null,
                  count: state.totalUsers,
                  error: state.totalUsersError,
                });
              }
              if (columns.startsWith('id, plan,')) {
                return resultQuery({
                  data: state.paidUsers,
                  error: state.paidUsersError,
                });
              }
              return resultQuery({ data: state.signups, error: state.signupsError });
            },
          };
        }
        if (table === 'activity_events') {
          return {
            select(columns) {
              state.selectCalls.push({ table, columns });
              if (columns === 'event, user_id, props, created_at') {
                return resultQuery({
                  data: state.billingEvents,
                  error: state.billingEventsError,
                });
              }
              return resultQuery({ data: state.events, error: state.eventsError });
            },
          };
        }
        if (table === 'ai_usage_costs') {
          return {
            select(columns) {
              state.selectCalls.push({ table, columns });
              return resultQuery({
                data: state.aiCosts,
                error: state.aiCostsError,
              });
            },
          };
        }
        if (table === 'attempts') {
          return {
            select(columns) {
              state.selectCalls.push({ table, columns });
              return resultQuery({ data: state.attempts, error: state.attemptsError });
            },
          };
        }
        if (table === 'daily_reports') {
          return {
            select(columns) {
              state.selectCalls.push({ table, columns });
              return resultQuery({ data: state.history, error: state.historyError });
            },
            async upsert(values, options) {
              state.upsertCalls.push({ values, options });
              if (state.upsertReject) throw state.upsertReject;
              return { data: null, error: state.upsertError };
            },
          };
        }
        throw new Error(`unexpected-table:${table}`);
      },
      async rpc(name, args) {
        state.rpcCalls.push({ name, args });
        if (state.retentionReject) throw state.retentionReject;
        return state.retentionResponse;
      },
    };
  },
}));

import handler from '../pages/api/cron/daily-report';

function makeReq({
  method = 'GET',
  authorization = 'Bearer cron-test',
  query = { date: '2026-07-18' },
} = {}) {
  return {
    method,
    headers: authorization ? { authorization } : {},
    query,
  };
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

describe('GET /api/cron/daily-report persistence', () => {
  afterAll(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.CRON_SECRET = 'cron-test';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';
    delete process.env.RESEND_API_KEY;
    delete process.env.REPORT_EMAIL;
    state.clientCreations = 0;
    state.fromCalls = [];
    state.selectCalls = [];
    state.signups = [];
    state.signupsError = null;
    state.totalUsers = 0;
    state.totalUsersError = null;
    state.paidUsers = [];
    state.paidUsersError = null;
    state.events = [];
    state.eventsError = null;
    state.billingEvents = [];
    state.billingEventsError = null;
    state.attempts = [];
    state.attemptsError = null;
    state.aiCosts = [];
    state.aiCostsError = null;
    state.retentionResponse = {
      data: [{ visitors: 0, returning_visitors: 0 }],
      error: null,
    };
    state.retentionReject = null;
    state.rpcCalls = [];
    state.history = [];
    state.historyError = null;
    state.upsertError = null;
    state.upsertReject = null;
    state.upsertCalls = [];
  });

  it('rejects unsupported methods before authentication or dependencies', async () => {
    const res = await callRoute({ method: 'POST', authorization: null });

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
    expect(res.ended).toBe(true);
    expect(state.clientCreations).toBe(0);
  });

  it('requires the configured bearer secret before creating an admin client', async () => {
    const missing = await callRoute({ authorization: null });
    const wrong = await callRoute({ authorization: 'Bearer wrong' });

    expect([missing.statusCode, wrong.statusCode]).toEqual([401, 401]);
    expect(state.clientCreations).toBe(0);
  });

  it('returns a controlled error when persistence is not configured', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Report is not configured.' });
    expect(state.clientCreations).toBe(0);
  });

  it.each([
    ['malformed', 'not-a-date'],
    ['empty', ''],
    ['impossible', '2026-02-31'],
    ['non-scalar', ['2026-07-18', '2026-07-17']],
    ['future', '2099-01-01'],
  ])('rejects an explicit %s backfill date before database work', async (_case, date) => {
    const res = await callRoute({ query: { date } });

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      error: 'Date must be a completed UTC day in YYYY-MM-DD format.',
    });
    expect(state.clientCreations).toBe(0);
    expect(state.upsertCalls).toEqual([]);
  });

  it('rejects the current UTC day because it is not a completed report period', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(
      Date.parse('2026-07-19T12:00:00.000Z')
    );

    const res = await callRoute({ query: { date: '2026-07-19' } });

    expect(res.statusCode).toBe(400);
    expect(state.clientCreations).toBe(0);
  });

  it('accepts a real leap-day backfill and preserves its exact UTC range', async () => {
    const res = await callRoute({ query: { date: '2024-02-29' } });

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.report.date).toBe('2024-02-29');
    expect(state.rpcCalls[0]).toEqual({
      name: 'returning_visitor_stats',
      args: {
        p_start: '2024-02-29T00:00:00.000Z',
        p_end: '2024-03-01T00:00:00.000Z',
      },
    });
    expect(state.upsertCalls[0].values.report_date).toBe('2024-02-29');
  });

  it('defaults to the previous completed UTC day when no override is supplied', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(
      Date.parse('2026-07-19T12:00:00.000Z')
    );

    const res = await callRoute({ query: {} });

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.report.date).toBe('2026-07-18');
    expect(state.upsertCalls[0].values.report_date).toBe('2026-07-18');
  });

  it('persists the generated report before returning success', async () => {
    state.totalUsers = 12;
    const fetch = vi.spyOn(globalThis, 'fetch');

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.ok).toBe(true);
    expect(res.jsonBody.email).toEqual({
      sent: false,
      reason: 'email-not-configured',
    });
    expect(res.jsonBody.report).toMatchObject({
      date: '2026-07-18',
      signups: { count: 0, totalUsers: 12 },
    });
    expect(state.upsertCalls).toHaveLength(1);
    expect(state.upsertCalls[0]).toMatchObject({
      values: {
        report_date: '2026-07-18',
        data: { date: '2026-07-18' },
      },
      options: { onConflict: 'report_date' },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 503 and skips email when the system-of-record upsert resolves with an error', async () => {
    state.upsertError = { message: 'database unavailable' };
    const fetch = vi.spyOn(globalThis, 'fetch');

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Report generation failed.' });
    expect(state.upsertCalls).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 503 and skips email when the system-of-record upsert rejects', async () => {
    state.upsertReject = new Error('network unavailable');
    const fetch = vi.spyOn(globalThis, 'fetch');

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Report generation failed.' });
    expect(state.upsertCalls).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not attempt persistence when a required source query fails', async () => {
    state.eventsError = { message: 'activity unavailable' };

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Report generation failed.' });
    expect(state.upsertCalls).toEqual([]);
  });

  it('persists a report with null retention when the optional RPC fails', async () => {
    state.retentionResponse = {
      data: null,
      error: { message: 'function unavailable' },
    };

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.report.activity.retention).toBeNull();
    expect(state.upsertCalls[0].values.data.activity.retention).toBeNull();
  });

  it('persists a report with null retention when the optional RPC rejects', async () => {
    state.retentionReject = new Error('network unavailable');

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.report.activity.retention).toBeNull();
    expect(state.upsertCalls[0].values.data.activity.retention).toBeNull();
    expect(state.rpcCalls).toEqual([
      {
        name: 'returning_visitor_stats',
        args: {
          p_start: '2026-07-18T00:00:00.000Z',
          p_end: '2026-07-19T00:00:00.000Z',
        },
      },
    ]);
  });

  it('tracks revenue, AI costs, and paid-user activity in the persisted report', async () => {
    state.paidUsers = [
      {
        id: 'paid-1',
        plan: 'premium',
        plan_status: 'active',
        plan_renews_at: '2026-08-18T00:00:00.000Z',
        plan_expires_at: null,
        billing_pause_until: null,
      },
      {
        id: 'paused-1',
        plan: 'premium',
        plan_status: 'active',
        plan_renews_at: '2026-08-18T00:00:00.000Z',
        plan_expires_at: null,
        billing_pause_until: '2099-01-01T00:00:00.000Z',
      },
    ];
    state.events = [
      {
        event: 'page_view',
        user_id: 'paid-1',
        anon_id: 'billing:paid-1',
        props: {},
        created_at: '2026-07-18T10:00:00.000Z',
      },
    ];
    state.attempts = [{ skill: 'writing', user_id: 'paid-1', per_question: {} }];
    state.aiCosts = [
      {
        user_id: 'paid-1',
        skill: 'writing',
        feature: 'writing_score',
        operation: 'score',
        model: 'gpt-test',
        input_tokens: 1000,
        output_tokens: 250,
        audio_seconds: 0,
        cost_usd: '0.0125',
        pricing_known: true,
        estimated: false,
      },
      {
        user_id: 'paid-1',
        skill: 'speaking',
        feature: 'speaking_score',
        operation: 'score',
        model: 'gpt-test',
        input_tokens: 0,
        output_tokens: 0,
        audio_seconds: 60,
        cost_usd: null,
        pricing_known: false,
        estimated: true,
      },
    ];
    state.billingEvents = [
      {
        event: 'subscription_activated',
        user_id: 'paid-1',
        props: { amount_minor: 1500, currency: 'usd' },
      },
      {
        event: 'subscription_payment_succeeded',
        user_id: 'paid-2',
        props: { amount_minor: 2000, currency: 'usd' },
      },
      {
        event: 'payment_refunded',
        user_id: 'paid-3',
        props: { amount_minor: 500, currency: 'usd' },
      },
      {
        event: 'subscription_plan_changed',
        user_id: 'paid-1',
        props: {},
      },
      {
        event: 'subscription_canceled',
        user_id: 'paid-3',
        props: {},
      },
    ];

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.report.paid).toEqual({
      available: true,
      entitledUsers: 1,
      activeUsers: 1,
      practicingUsers: 1,
      aiUsers: 1,
      newUsers: 1,
      upgrades: 1,
      cancellations: 1,
    });
    expect(res.jsonBody.report.economics.revenue).toMatchObject({
      available: true,
      payments: 2,
      refunds: 1,
      disputes: 0,
      currencies: {
        usd: {
          grossMinor: 3500,
          refundsMinor: 500,
          netMinor: 3000,
        },
      },
    });
    expect(res.jsonBody.report.economics.ai).toMatchObject({
      available: true,
      calls: 2,
      users: 1,
      knownCostUsd: 0.0125,
      paidKnownCostUsd: 0.0125,
      unpricedRequests: 1,
      estimatedRequests: 1,
    });
    expect(state.upsertCalls[0].values.data.economics.ai.calls).toBe(2);
  });

  it('keeps the report available when optional paid or cost queries fail', async () => {
    state.paidUsersError = { message: 'paid snapshot unavailable' };
    state.aiCostsError = { message: 'cost ledger unavailable' };
    state.billingEventsError = { message: 'billing metrics unavailable' };

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.report.paid.available).toBe(false);
    expect(res.jsonBody.report.economics.ai.available).toBe(false);
    expect(res.jsonBody.report.economics.revenue.available).toBe(false);
  });

  it('returns success after a confirmed report email delivery', async () => {
    process.env.RESEND_API_KEY = 'resend-test-key';
    process.env.REPORT_EMAIL = 'owner@example.com';
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    });

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.email).toEqual({ sent: true });
    expect(state.upsertCalls).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' })
    );
    const request = fetch.mock.calls[0][1];
    expect(request.headers.Authorization).toBe('Bearer resend-test-key');
    expect(JSON.parse(request.body)).toMatchObject({
      to: ['owner@example.com'],
      subject: expect.stringContaining('IELTS Bank'),
      html: expect.stringContaining('Revenue &amp; AI unit economics'),
    });
    expect(JSON.parse(request.body).html).toContain('Paid user activity');
  });

  it('keeps a persisted report successful when Resend returns an HTTP error', async () => {
    process.env.RESEND_API_KEY = 'resend-test-key';
    process.env.REPORT_EMAIL = 'owner@example.com';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503 });

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.ok).toBe(true);
    expect(res.jsonBody.email).toEqual({ sent: false, reason: 'resend-503' });
    expect(state.upsertCalls).toHaveLength(1);
  });

  it('keeps a persisted report successful when the Resend request rejects', async () => {
    process.env.RESEND_API_KEY = 'resend-test-key';
    process.env.REPORT_EMAIL = 'owner@example.com';
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('network unavailable')
    );

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.ok).toBe(true);
    expect(res.jsonBody.email).toEqual({
      sent: false,
      reason: 'resend-request-failed',
    });
    expect(state.upsertCalls).toHaveLength(1);
  });
});

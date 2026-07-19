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
  events: [],
  eventsError: null,
  attempts: [],
  attemptsError: null,
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
              return resultQuery({ data: state.signups, error: state.signupsError });
            },
          };
        }
        if (table === 'activity_events') {
          return {
            select(columns) {
              state.selectCalls.push({ table, columns });
              return resultQuery({ data: state.events, error: state.eventsError });
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
    state.events = [];
    state.eventsError = null;
    state.attempts = [];
    state.attemptsError = null;
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
      html: expect.stringContaining('Daily report'),
    });
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

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { unsubscribeToken } from '../lib/lifecycleEmail';

const originalEnv = {
  EMAIL_UNSUBSCRIBE_SECRET: process.env.EMAIL_UNSUBSCRIBE_SECRET,
  SUPABASE_URL: process.env.SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const state = {
  clientCreates: 0,
  updates: [],
  updateError: null,
  updateReject: null,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    state.clientCreates += 1;
    return {
      from: (table) => ({
        update: (fields) => ({
          eq: async (field, value) => {
            state.updates.push({ table, fields, field, value });
            if (state.updateReject) throw state.updateReject;
            return { error: state.updateError };
          },
        }),
      }),
    };
  },
}));

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function makeReq(options = {}) {
  const email = options.email ?? 'learner@example.com';
  const token = options.token ?? unsubscribeToken(email);
  return {
    method: options.method ?? 'GET',
    query: { email, token },
  };
}

function makeRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    ended: false,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

async function callRoute(options) {
  const { default: handler } = await import('../pages/api/newsletter/unsubscribe');
  const res = makeRes();
  await handler(makeReq(options), res);
  return res;
}

describe('GET /api/newsletter/unsubscribe', () => {
  beforeEach(() => {
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'unsubscribe-test-secret';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';
    state.clientCreates = 0;
    state.updates = [];
    state.updateError = null;
    state.updateReject = null;
    vi.restoreAllMocks();
  });

  afterAll(() => {
    restoreEnv('EMAIL_UNSUBSCRIBE_SECRET', originalEnv.EMAIL_UNSUBSCRIBE_SECRET);
    restoreEnv('SUPABASE_URL', originalEnv.SUPABASE_URL);
    restoreEnv('NEXT_PUBLIC_SUPABASE_URL', originalEnv.NEXT_PUBLIC_SUPABASE_URL);
    restoreEnv('SUPABASE_SERVICE_ROLE_KEY', originalEnv.SUPABASE_SERVICE_ROLE_KEY);
  });

  it('allows only GET requests and advertises the supported method', async () => {
    const res = await callRoute({ method: 'POST' });

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
    expect(res.ended).toBe(true);
    expect(state.clientCreates).toBe(0);
  });

  it('rejects an invalid signed link before creating an admin client', async () => {
    const res = await callRoute({ token: '0'.repeat(64) });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatch(/invalid or expired/i);
    expect(state.clientCreates).toBe(0);
    expect(state.updates).toEqual([]);
  });

  it('returns a controlled service error when admin configuration is missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatch(/temporarily unavailable/i);
    expect(state.clientCreates).toBe(0);
  });

  it('marks the normalized signed address unsubscribed', async () => {
    const res = await callRoute({ email: ' Learner@Example.com ' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatch(/have been unsubscribed/i);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({
      table: 'newsletter_subscribers',
      field: 'email',
      value: 'learner@example.com',
    });
    expect(Number.isNaN(Date.parse(state.updates[0].fields.unsubscribed_at))).toBe(false);
  });

  it('returns a controlled service error for a resolved update failure', async () => {
    state.updateError = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatch(/temporarily unavailable/i);
    expect(state.updates).toHaveLength(1);
  });

  it('returns a controlled service error when the update rejects', async () => {
    state.updateReject = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatch(/temporarily unavailable/i);
    expect(state.updates).toHaveLength(1);
  });
});

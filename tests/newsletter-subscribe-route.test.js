import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';

const state = {
  limitResponse: { data: true, error: null },
  limitReject: null,
  tableCalls: [],
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async () => {
      if (state.limitReject) throw state.limitReject;
      return state.limitResponse;
    },
    from: (table) => ({
      upsert: async (values, options) => {
        state.tableCalls.push({ table, values, options });
        return { data: null, error: null };
      },
    }),
  }),
}));

function makeReq() {
  return {
    method: 'POST',
    headers: {
      origin: 'https://www.ielts-bank.com',
      'x-real-ip': '203.0.113.10',
    },
    body: {
      email: ' Learner@Example.com ',
      source: 'homepage',
    },
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

async function callRoute() {
  const { default: handler } = await import(
    '../pages/api/newsletter/subscribe'
  );
  const res = makeRes();
  await handler(makeReq(), res);
  return res;
}

describe('POST /api/newsletter/subscribe rate-limit safety', () => {
  beforeEach(() => {
    state.limitResponse = { data: true, error: null };
    state.limitReject = null;
    state.tableCalls = [];
    vi.restoreAllMocks();
  });

  it('fails closed when the limiter resolves with an error', async () => {
    state.limitResponse = {
      data: null,
      error: { message: 'database unavailable' },
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/temporarily unavailable/i);
    expect(state.tableCalls).toEqual([]);
  });

  it('fails closed when the limiter rejects', async () => {
    state.limitReject = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/temporarily unavailable/i);
    expect(state.tableCalls).toEqual([]);
  });

  it('returns 429 only after a verified limiter denial', async () => {
    state.limitResponse = { data: false, error: null };

    const res = await callRoute();

    expect(res.statusCode).toBe(429);
    expect(state.tableCalls).toEqual([]);
  });

  it('normalizes and stores a valid email after verified allowance', async () => {
    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(state.tableCalls).toEqual([
      {
        table: 'newsletter_subscribers',
        values: {
          email: 'learner@example.com',
          source: 'homepage',
          confirmed: true,
          unsubscribed_at: null,
        },
        options: { onConflict: 'email' },
      },
    ]);
  });
});

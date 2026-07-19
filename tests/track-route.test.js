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
    auth: {
      getUser: async () => ({
        data: null,
        error: { message: 'no bearer token' },
      }),
    },
    rpc: async () => {
      if (state.limitReject) throw state.limitReject;
      return state.limitResponse;
    },
    from: (table) => ({
      insert: async (values) => {
        state.tableCalls.push({ operation: 'insert', table, values });
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
      event: 'page_view',
      anon_id: '123e4567-e89b-42d3-a456-426614174000',
      path: '/pricing',
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
  const { default: handler } = await import('../pages/api/track');
  const res = makeRes();
  await handler(makeReq(), res);
  return res;
}

describe('POST /api/track rate-limit outcomes', () => {
  beforeEach(() => {
    state.limitResponse = { data: true, error: null };
    state.limitReject = null;
    state.tableCalls = [];
    vi.restoreAllMocks();
  });

  it('returns 503 when the limiter resolves with an infrastructure error', async () => {
    state.limitResponse = {
      data: null,
      error: { message: 'database unavailable' },
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toBe('Telemetry unavailable.');
    expect(state.tableCalls).toEqual([]);
  });

  it('returns 503 when the limiter rejects', async () => {
    state.limitReject = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toBe('Telemetry unavailable.');
    expect(state.tableCalls).toEqual([]);
  });

  it('returns 429 only after a verified limiter denial', async () => {
    state.limitResponse = { data: false, error: null };

    const res = await callRoute();

    expect(res.statusCode).toBe(429);
    expect(res.jsonBody.error).toBe('Rate limited.');
    expect(state.tableCalls).toEqual([]);
  });

  it('accepts telemetry after a verified limiter allowance', async () => {
    const res = await callRoute();

    expect(res.statusCode).toBe(202);
    expect(state.tableCalls).toHaveLength(1);
    expect(state.tableCalls[0]).toMatchObject({
      operation: 'insert',
      table: 'activity_events',
    });
  });
});

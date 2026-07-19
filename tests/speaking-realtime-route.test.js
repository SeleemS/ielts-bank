import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';

const state = {
  authUser: null,
  authReject: null,
  planRow: { plan: 'free', plan_status: 'inactive' },
  planError: null,
  planReject: null,
  rateLimits: {},
  rateLimitError: null,
  rateLimitReject: null,
  rpcCalls: [],
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => {
        if (state.authReject) throw state.authReject;
        return state.authUser
          ? { data: { user: state.authUser }, error: null }
          : { data: null, error: { message: 'invalid token' } };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (state.planReject) throw state.planReject;
            return { data: state.planRow, error: state.planError };
          },
        }),
      }),
    }),
    rpc: async (name, args) => {
      state.rpcCalls.push({ name, args });
      if (state.rateLimitReject) throw state.rateLimitReject;
      return {
        data: Object.hasOwn(state.rateLimits, args.p_bucket)
          ? state.rateLimits[args.p_bucket]
          : true,
        error: state.rateLimitError,
      };
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
    body: {},
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

async function callRoute(options) {
  const { default: handler } = await import('../pages/api/score/speaking-realtime');
  const res = makeRes();
  await handler(makeReq(options), res);
  return res;
}

describe('POST /api/score/speaking-realtime access gate', () => {
  beforeEach(() => {
    state.authUser = null;
    state.authReject = null;
    state.planRow = { plan: 'free', plan_status: 'inactive' };
    state.planError = null;
    state.planReject = null;
    state.rateLimits = {};
    state.rateLimitError = null;
    state.rateLimitReject = null;
    state.rpcCalls = [];
    vi.restoreAllMocks();
  });

  it('enforces POST and same-origin requests before authentication', async () => {
    let res = await callRoute({ method: 'GET' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');

    res = await callRoute({ origin: 'https://attacker.example' });
    expect(res.statusCode).toBe(403);
    expect(state.rpcCalls).toEqual([]);
  });

  it('requires authentication', async () => {
    const res = await callRoute({ authorization: '' });

    expect(res.statusCode).toBe(401);
    expect(state.rpcCalls).toEqual([]);
  });

  it('fails safely when auth verification rejects', async () => {
    state.authReject = new Error('auth service unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/temporarily unavailable/i);
    expect(state.rpcCalls).toEqual([]);
  });

  it('reserves the Premium response for a verified Free account', async () => {
    state.authUser = { id: 'user-1' };
    const res = await callRoute();

    expect(res.statusCode).toBe(402);
    expect(res.jsonBody.reason).toBe('not_premium');
    expect(state.rpcCalls).toEqual([]);
  });

  it('does not misreport a resolved entitlement error as non-premium', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = null;
    state.planError = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.reason).toBeUndefined();
    expect(state.rpcCalls).toEqual([]);
  });

  it('recovers when the entitlement query rejects', async () => {
    state.authUser = { id: 'user-1' };
    state.planReject = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.reason).toBeUndefined();
    expect(state.rpcCalls).toEqual([]);
  });

  it('fails closed when a limiter returns an infrastructure error', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    state.rateLimitError = new Error('limiter unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls).toHaveLength(1);
  });

  it('fails closed when a limiter RPC rejects', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    state.rateLimitReject = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls).toHaveLength(1);
  });

  it('fails closed when global scoring capacity is exhausted', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    state.rateLimits['realtime-score-global'] = false;
    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls).toHaveLength(1);
  });

  it('returns 429 only for a verified per-IP limit', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    state.rateLimits['realtime-score-ip'] = false;
    const res = await callRoute();

    expect(res.statusCode).toBe(429);
    expect(state.rpcCalls.map(({ args }) => args.p_bucket)).toEqual([
      'realtime-score-global',
      'realtime-score-ip',
    ]);
  });
});

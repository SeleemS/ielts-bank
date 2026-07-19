import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';
process.env.OPENAI_API_KEY = 'sk-test-dummy';

const state = {
  authUser: null,
  rpcCalls: [],
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () =>
        state.authUser
          ? { data: { user: state.authUser }, error: null }
          : { data: null, error: { message: 'invalid token' } },
    },
    rpc: async (name, args) => {
      state.rpcCalls.push({ name, args });
      if (name === 'check_rate_limit') return { data: true, error: null };
      if (name === 'consume_ai_score') {
        return {
          data: {
            allowed: true,
            free: true,
            remaining: 0,
            consumedAt: '2026-07-19T12:00:00.000Z',
          },
          error: null,
        };
      }
      if (name === 'refund_ai_score') return { data: true, error: null };
      return { data: null, error: { message: `unexpected RPC ${name}` } };
    },
  }),
}));

vi.mock('../lib/openaiChat', () => ({
  chatCompletionWithFallback: vi.fn(async () => ({
    ok: false,
    status: 503,
    detail: 'provider unavailable',
  })),
}));

function makeReq({ userToken = 'token', body = {} } = {}) {
  return {
    method: 'POST',
    headers: {
      origin: 'https://www.ielts-bank.com',
      ...(userToken ? { authorization: `Bearer ${userToken}` } : {}),
    },
    body,
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

describe('POST /api/score/writing account and quota safety', () => {
  beforeEach(() => {
    state.authUser = null;
    state.rpcCalls = [];
  });

  it('rejects a valid anonymous-auth token before consuming quota', async () => {
    state.authUser = { id: 'anonymous-user', email: null, is_anonymous: true };
    const { default: handler } = await import('../pages/api/score/writing');
    const res = makeRes();

    await handler(makeReq(), res);

    expect(res.statusCode).toBe(401);
    expect(state.rpcCalls).toEqual([]);
  });

  it('refunds the exact consumed sample when the scoring provider fails', async () => {
    state.authUser = {
      id: 'linked-user',
      email: 'learner@example.com',
      is_anonymous: false,
    };
    const essay = Array.from({ length: 60 }, (_, index) => `word${index}`).join(' ');
    const { default: handler } = await import('../pages/api/score/writing');
    const res = makeRes();

    await handler(makeReq({ body: { essay, task: 2 } }), res);

    expect(res.statusCode).toBe(502);
    expect(state.rpcCalls.map(({ name }) => name)).toEqual([
      'check_rate_limit',
      'check_rate_limit',
      'consume_ai_score',
      'refund_ai_score',
    ]);
    expect(state.rpcCalls.at(-1).args).toEqual({
      p_uid: 'linked-user',
      p_skill: 'writing',
      p_free: true,
      p_consumed_at: '2026-07-19T12:00:00.000Z',
    });
  });
});

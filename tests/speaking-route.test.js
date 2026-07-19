import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';

const state = {
  authUser: null,
  rpcCalls: [],
  removedPaths: [],
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
            free: false,
            remaining: 0,
            consumedAt: '2026-07-19T12:00:00.000Z',
          },
          error: null,
        };
      }
      if (name === 'refund_ai_score') return { data: true, error: null };
      return { data: null, error: { message: `unexpected RPC ${name}` } };
    },
    from: () => ({
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: async () => ({
            data: {
              plan: 'premium',
              plan_status: 'active',
              plan_renews_at: null,
              plan_expires_at: null,
              billing_pause_until: null,
            },
            error: null,
          }),
        };
        return chain;
      },
    }),
    storage: {
      from: () => ({
        remove: async (paths) => {
          state.removedPaths.push(...paths);
          return { error: null };
        },
      }),
    },
  }),
}));

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

describe('POST /api/score/speaking quota safety', () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    state.authUser = {
      id: 'premium-user',
      email: 'learner@example.com',
      is_anonymous: false,
    };
    state.rpcCalls = [];
    state.removedPaths = [];
  });

  it('refunds the consumed daily unit when scoring cannot start', async () => {
    const { default: handler } = await import('../pages/api/score/speaking');
    const req = {
      method: 'POST',
      headers: {
        origin: 'https://www.ielts-bank.com',
        authorization: 'Bearer token',
      },
      body: {
        passageSlug: 'speaking-question',
        part: 2,
        audioPath: 'premium-user/recording.webm',
      },
      socket: { remoteAddress: '127.0.0.1' },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(502);
    expect(state.rpcCalls.map(({ name }) => name)).toEqual([
      'check_rate_limit',
      'check_rate_limit',
      'consume_ai_score',
      'refund_ai_score',
    ]);
    expect(state.rpcCalls.at(-1).args).toEqual({
      p_uid: 'premium-user',
      p_skill: 'speaking',
      p_free: false,
      p_consumed_at: '2026-07-19T12:00:00.000Z',
    });
    expect(state.removedPaths).toEqual(['premium-user/recording.webm']);
  });
});

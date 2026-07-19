import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';

const state = {
  authUser: null,
  authReject: null,
  planRow: {
    plan: 'premium',
    plan_status: 'active',
    plan_renews_at: null,
    plan_expires_at: null,
    billing_pause_until: null,
  },
  planError: null,
  planReject: null,
  rateLimits: {},
  rateLimitErrors: {},
  rateLimitRejects: {},
  rpcCalls: [],
  removedPaths: [],
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
    rpc: async (name, args) => {
      state.rpcCalls.push({ name, args });
      if (name === 'check_rate_limit') {
        if (state.rateLimitRejects[args.p_bucket]) {
          throw state.rateLimitRejects[args.p_bucket];
        }
        return {
          data: Object.hasOwn(state.rateLimits, args.p_bucket)
            ? state.rateLimits[args.p_bucket]
            : true,
          error: state.rateLimitErrors[args.p_bucket] || null,
        };
      }
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
    from: (table) => ({
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: async () => {
            if (table === 'users' && state.planReject) throw state.planReject;
            return {
              data: table === 'users' ? state.planRow : null,
              error: table === 'users' ? state.planError : null,
            };
          },
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

function makeReq({
  authorization = 'Bearer token',
  body = {
    passageSlug: 'speaking-question',
    part: 2,
    audioPath: 'premium-user/recording.webm',
  },
} = {}) {
  return {
    method: 'POST',
    headers: {
      origin: 'https://www.ielts-bank.com',
      authorization,
    },
    body,
    socket: { remoteAddress: '127.0.0.1' },
  };
}

async function callRoute(options) {
  const { default: handler } = await import('../pages/api/score/speaking');
  const res = makeRes();
  await handler(makeReq(options), res);
  return res;
}

describe('POST /api/score/speaking quota safety', () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    state.authReject = null;
    state.authUser = {
      id: 'premium-user',
      email: 'learner@example.com',
      is_anonymous: false,
    };
    state.planRow = {
      plan: 'premium',
      plan_status: 'active',
      plan_renews_at: null,
      plan_expires_at: null,
      billing_pause_until: null,
    };
    state.planError = null;
    state.planReject = null;
    state.rateLimits = {};
    state.rateLimitErrors = {};
    state.rateLimitRejects = {};
    state.rpcCalls = [];
    state.removedPaths = [];
    vi.restoreAllMocks();
  });

  it('requires authentication before quota or storage work', async () => {
    state.authUser = null;
    const res = await callRoute({ authorization: '' });

    expect(res.statusCode).toBe(401);
    expect(state.rpcCalls).toEqual([]);
    expect(state.removedPaths).toEqual([]);
  });

  it('returns a service error when auth verification rejects', async () => {
    state.authReject = new Error('auth service unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls).toEqual([]);
    expect(state.removedPaths).toEqual([]);
  });

  it('reserves the Premium response for a verified Free account', async () => {
    state.planRow = { plan: 'free', plan_status: 'inactive' };
    const res = await callRoute();

    expect(res.statusCode).toBe(402);
    expect(res.jsonBody.reason).toBe('premium_required');
    expect(state.rpcCalls).toEqual([]);
  });

  it('does not misreport a resolved entitlement error as Premium required', async () => {
    state.planRow = null;
    state.planError = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.reason).toBeUndefined();
    expect(state.rpcCalls).toEqual([]);
  });

  it('recovers when the entitlement query rejects', async () => {
    state.planReject = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.reason).toBeUndefined();
    expect(state.rpcCalls).toEqual([]);
  });

  it('fails closed when the global limiter returns an error', async () => {
    state.rateLimitErrors['speaking-score-global'] = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls.map(({ name }) => name)).toEqual(['check_rate_limit']);
  });

  it('fails closed when the global limiter rejects', async () => {
    state.rateLimitRejects['speaking-score-global'] = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls.map(({ name }) => name)).toEqual(['check_rate_limit']);
  });

  it('returns 429 only for verified global exhaustion', async () => {
    state.rateLimits['speaking-score-global'] = false;
    const res = await callRoute();

    expect(res.statusCode).toBe(429);
    expect(state.rpcCalls.map(({ name }) => name)).toEqual(['check_rate_limit']);
  });

  it('fails closed instead of opening cost access on a per-user limiter error', async () => {
    state.rateLimitErrors['speaking-score'] = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls.map(({ args }) => args.p_bucket)).toEqual([
      'speaking-score-global',
      'speaking-score',
    ]);
  });

  it('returns 429 for a verified per-user limit', async () => {
    state.rateLimits['speaking-score'] = false;
    const res = await callRoute();

    expect(res.statusCode).toBe(429);
    expect(state.rpcCalls.map(({ args }) => args.p_bucket)).toEqual([
      'speaking-score-global',
      'speaking-score',
    ]);
  });

  it('refunds the consumed daily unit when scoring cannot start', async () => {
    const res = await callRoute();

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

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
  tableCalls: [],
  scoreError: null,
  scoreReject: null,
  deletedAttemptIds: [],
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
    from: (table) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (state.planReject) throw state.planReject;
            return { data: state.planRow, error: state.planError };
          },
        }),
      }),
      insert: (values) => {
        state.tableCalls.push({ table, values });
        if (table === 'attempts') {
          return {
            select: () => ({
              single: async () => ({
                data: { id: 'attempt-id' },
                error: null,
              }),
            }),
          };
        }
        if (table === 'scores' && state.scoreReject) {
          return Promise.reject(state.scoreReject);
        }
        return Promise.resolve({
          data: null,
          error: table === 'scores' ? state.scoreError : null,
        });
      },
      delete: () => ({
        eq: async (column, value) => {
          if (table === 'attempts' && column === 'id') {
            state.deletedAttemptIds.push(value);
          }
          return { data: null, error: null };
        },
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
  body = {},
} = {}) {
  return {
    method,
    headers: { origin, authorization },
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
    state.tableCalls = [];
    state.scoreError = null;
    state.scoreReject = null;
    state.deletedAttemptIds = [];
    delete process.env.OPENAI_API_KEY;
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
    const res = await callRoute({ body: validTranscriptBody() });

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls).toHaveLength(1);
  });

  it('fails closed when a limiter RPC rejects', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    state.rateLimitReject = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute({ body: validTranscriptBody() });

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls).toHaveLength(1);
  });

  it('fails closed when global scoring capacity is exhausted', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    state.rateLimits['realtime-score-global'] = false;
    const res = await callRoute({ body: validTranscriptBody() });

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls.map(({ args }) => args.p_bucket)).toEqual([
      'realtime-score-ip',
      'realtime-score-global',
    ]);
  });

  it('returns 429 only for a verified per-IP limit', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    state.rateLimits['realtime-score-ip'] = false;
    const res = await callRoute({ body: validTranscriptBody() });

    expect(res.statusCode).toBe(429);
    expect(state.rpcCalls.map(({ args }) => args.p_bucket)).toEqual([
      'realtime-score-ip',
    ]);
  });

  it('rejects an unscorable transcript before consuming limiter allowance', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };

    const res = await callRoute({
      body: {
        transcript: [{ role: 'candidate', text: 'This answer is too short.' }],
      },
    });

    expect(res.statusCode).toBe(422);
    expect(state.rpcCalls).toEqual([]);
  });

  it('rejects an unknown session mode before consuming limiter allowance', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };

    const res = await callRoute({
      body: {
        ...validTranscriptBody(),
        mode: 'karaoke',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toMatch(/unknown session mode/i);
    expect(state.rpcCalls).toEqual([]);
    expect(state.tableCalls).toEqual([]);
  });

  it('computes and persists the overall from the three criterion bands', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    process.env.OPENAI_API_KEY = 'sk-test-dummy';
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                overallBand: 3,
                criteria: {
                  fluencyCoherence: criterion(6.5),
                  lexicalResource: criterion(7.5),
                  grammaticalRange: criterion(8),
                },
                summary: 'A clear interview.',
                improvements: ['Develop longer answers.'],
              }),
            },
          },
        ],
      }),
    });

    const res = await callRoute({ body: validTranscriptBody() });

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.overallBand).toBe(7.5);
    expect(
      state.tableCalls.find(({ table }) => table === 'attempts').values.band
    ).toBe(7.5);
    expect(
      state.tableCalls.find(({ table }) => table === 'scores').values
        .overall_band
    ).toBe(7.5);
  });

  it('rejects malformed criterion bands without persisting a score', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    process.env.OPENAI_API_KEY = 'sk-test-dummy';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                overallBand: 7,
                criteria: {
                  fluencyCoherence: criterion(6.5),
                  lexicalResource: criterion(7.5),
                },
                summary: 'Incomplete provider result.',
                improvements: [],
              }),
            },
          },
        ],
      }),
    });

    const res = await callRoute({ body: validTranscriptBody() });

    expect(res.statusCode).toBe(502);
    expect(state.tableCalls).toHaveLength(1);
    expect(state.tableCalls[0]).toMatchObject({
      table: 'ai_usage_costs',
      values: {
        user_id: 'user-1',
        skill: 'speaking',
        feature: 'speaking_realtime_score',
        operation: 'rubric_score',
        pricing_known: false,
      },
    });
  });

  it('removes the attempt when score persistence returns an error', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    state.scoreError = new Error('score insert failed');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSuccessfulRealtimeScore();

    const res = await callRoute({ body: validTranscriptBody() });

    expect(res.statusCode).toBe(200);
    expect(state.deletedAttemptIds).toEqual(['attempt-id']);
  });

  it('removes the attempt when score persistence rejects', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    state.scoreReject = new Error('score network failure');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSuccessfulRealtimeScore();

    const res = await callRoute({ body: validTranscriptBody() });

    expect(res.statusCode).toBe(200);
    expect(state.deletedAttemptIds).toEqual(['attempt-id']);
  });
});

function validTranscriptBody() {
  return {
    mode: 'mock',
    transcript: [
      {
        role: 'candidate',
        text: Array.from(
          { length: 40 },
          (_, index) => `candidate${index}`
        ).join(' '),
      },
    ],
  };
}

function criterion(band) {
  return {
    band,
    strengths: ['Clear organization.'],
    improvements: ['Add more detail.'],
  };
}

function mockSuccessfulRealtimeScore() {
  process.env.OPENAI_API_KEY = 'sk-test-dummy';
  vi.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              overallBand: 7,
              criteria: {
                fluencyCoherence: criterion(6.5),
                lexicalResource: criterion(7.5),
                grammaticalRange: criterion(8),
              },
              summary: 'A clear interview.',
              improvements: ['Develop longer answers.'],
            }),
          },
        },
      ],
    }),
  });
}

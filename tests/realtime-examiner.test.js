// tests/realtime-examiner.test.js
// Unit tests for the Realtime examiner core (lib/realtimeExaminer.js) and the
// session-mint route (auth, metering, refund-on-failure, happy path).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';
process.env.OPENAI_API_KEY = 'sk-test-dummy';

import {
  MODES,
  buildInstructions,
  buildSessionConfig,
  pickSpeakingItem,
  pickRandom,
} from '../lib/realtimeExaminer';

// ---------------------------------------------------------------------------
// lib
// ---------------------------------------------------------------------------
describe('realtimeExaminer lib', () => {
  it('defines the four metered modes with the agreed durations', () => {
    expect(MODES.mock.seconds).toBe(840);
    expect(MODES.part1.seconds).toBe(300);
    expect(MODES.part2.seconds).toBe(300);
    expect(MODES.part3.seconds).toBe(300);
  });

  const items = {
    part1: { content: { topic: 'Hometown', questions: [{ text: 'Where is your hometown?' }] } },
    part2: {
      content: {
        topic: 'Describe a book that influenced you.',
        bullets: ['what it was'],
        explainLine: 'and explain why.',
        roundOff: [{ text: 'Do you read often?' }],
      },
    },
    part3: { content: { theme: 'Reading', questions: [{ text: 'Why do people read less now?' }] } },
  };

  it('builds full-mock instructions containing all three parts and conduct rules', () => {
    const text = buildInstructions('mock', items, 840);
    expect(text).toMatch(/^You are an AI system simulating an IELTS Speaking examiner/);
    expect(text).toContain('Never claim to be human, certified, official');
    expect(text).toContain('PART 1');
    expect(text).toContain('PART 2');
    expect(text).toContain('PART 3');
    expect(text).toContain('Where is your hometown?');
    expect(text).toContain('Describe a book that influenced you.');
    expect(text).toContain('ONE question at a time');
    expect(text).toContain('~14 minutes');
  });

  it('builds drill instructions with only the requested part', () => {
    const text = buildInstructions('part2', items, 300);
    expect(text).toContain('PART 2');
    expect(text).not.toContain('PART 1');
    expect(text).not.toContain('PART 3');
  });

  it('builds a session config with model, transcription, and short expiry', () => {
    const cfg = buildSessionConfig('do the thing');
    expect(cfg.session.type).toBe('realtime');
    expect(cfg.session.model).toBeTruthy();
    expect(cfg.session.instructions).toBe('do the thing');
    expect(cfg.session.audio.input.transcription.model).toBeTruthy();
    expect(cfg.expires_after.seconds).toBeLessThanOrEqual(600);
  });

  it('pickRandom handles empty input', () => {
    expect(pickRandom([])).toBeNull();
    expect(pickRandom(null)).toBeNull();
  });

  it('pickSpeakingItem queries the right column and returns content', async () => {
    const calls = {};
    const admin = {
      from(table) {
        calls.table = table;
        return {
          select(cols) {
            calls.cols = cols;
            return {
              eq() {
                return {
                  eq() {
                    return {
                      not() {
                        return {
                          limit: async () => ({
                            data: [{ passage_id: 'p1', part: 2, cue_card: { topic: 'X' } }],
                            error: null,
                          }),
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
    const item = await pickSpeakingItem(admin, 2);
    expect(calls.table).toBe('speaking_details');
    expect(calls.cols).toContain('cue_card');
    expect(item).toEqual({ passageId: 'p1', content: { topic: 'X' } });
  });
});

// ---------------------------------------------------------------------------
// mint route
// ---------------------------------------------------------------------------
const state = {
  authUser: null,
  meter: null,
  meterError: null,
  refundRpcError: null,
  rateLimit: true,
  rateLimitError: null,
  rateLimits: {},
  quotaRow: { realtime_seconds_remaining: 0, realtime_seconds_quota: 3600 },
  planRow: { plan: 'premium', plan_status: 'active', plan_renews_at: null, plan_expires_at: null, billing_pause_until: null },
  updates: [],
  realtimeRefunds: [],
  speakingRows: [{ passage_id: 'p1', part: 1, part1_questions: { topic: 'T', questions: [] } }],
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () =>
        state.authUser
          ? { data: { user: state.authUser }, error: null }
          : { data: null, error: { message: 'bad token' } },
    },
    rpc: async (fn, args) => {
      if (fn === 'check_rate_limit') {
        return state.rateLimitError
          ? { data: null, error: state.rateLimitError }
          : {
              data: Object.hasOwn(state.rateLimits, args.p_bucket)
                ? state.rateLimits[args.p_bucket]
                : state.rateLimit,
              error: null,
            };
      }
      if (fn === 'consume_realtime_seconds') {
        return state.meterError
          ? { data: null, error: { message: state.meterError } }
          : { data: state.meter, error: null };
      }
      if (fn === 'refund_realtime_seconds') {
        state.realtimeRefunds.push(args);
        return state.refundRpcError
          ? { data: null, error: state.refundRpcError }
          : { data: true, error: null };
      }
      return { data: null, error: { message: `unknown rpc ${fn}` } };
    },
    from: (table) => ({
      select: () => {
        const chain = {
          eq: () => chain,
          not: () => chain,
          limit: async () => ({
            data: state.speakingRows.map((r) => ({ ...r })),
            error: null,
          }),
          single: async () => ({ data: state.quotaRow, error: null }),
          maybeSingle: async () => ({
            data: table === 'users' ? state.planRow : null,
            error: null,
          }),
        };
        return chain;
      },
      update: (fields) => ({
        eq: async () => {
          state.updates.push({ table, fields });
          return { error: null };
        },
      }),
    }),
  }),
}));

function makeReq({ headers = {}, body = {} } = {}) {
  return { method: 'POST', headers, body, socket: { remoteAddress: '127.0.0.1' } };
}
function makeRes() {
  return {
    statusCode: null,
    jsonBody: null,
    headers: {},
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.jsonBody = b;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
  };
}

describe('POST /api/realtime/session', () => {
  let fetchMock;
  beforeEach(() => {
    state.authUser = null;
    state.meter = null;
    state.meterError = null;
    state.refundRpcError = null;
    state.rateLimit = true;
    state.rateLimitError = null;
    state.rateLimits = {};
    state.planRow = { plan: 'premium', plan_status: 'active', plan_renews_at: null, plan_expires_at: null, billing_pause_until: null };
    state.updates = [];
    state.realtimeRefunds = [];
    fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ value: 'ek_test_secret', expires_at: 12345 }),
    }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  async function call(body = { mode: 'mock' }, headers = { authorization: 'Bearer tok' }) {
    const { default: handler } = await import('../pages/api/realtime/session');
    const res = makeRes();
    await handler(makeReq({ headers, body }), res);
    return res;
  }

  it('rejects unauthenticated users', async () => {
    const res = await call({ mode: 'mock' }, {});
    expect(res.statusCode).toBe(401);
  });

  it('rejects unknown modes', async () => {
    state.authUser = { id: 'u1' };
    const res = await call({ mode: 'karaoke' });
    expect(res.statusCode).toBe(400);
  });

  it('402s a non-premium user with the upsell reason', async () => {
    state.authUser = { id: 'u1' };
    state.planRow = { plan: 'free', plan_status: 'inactive' };
    const res = await call();
    expect(res.statusCode).toBe(402);
    expect(res.jsonBody.reason).toBe('not_premium');
  });

  it('402s when minutes are exhausted, with reset info', async () => {
    state.authUser = { id: 'u1' };
    state.meter = { allowed: false, remaining: 120, reason: 'minutes_exhausted', resetsAt: 'soon' };
    const res = await call();
    expect(res.statusCode).toBe(402);
    expect(res.jsonBody.remainingSeconds).toBe(120);
  });

  it('mints a session and reports remaining minutes on the happy path', async () => {
    state.authUser = { id: 'u1' };
    state.meter = { allowed: true, remaining: 2760, resetsAt: 'later' };
    const res = await call({ mode: 'mock' });
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.clientSecret).toBe('ek_test_secret');
    expect(res.jsonBody.durationSeconds).toBe(840);
    expect(res.jsonBody.remainingSeconds).toBe(2760);
    // instructions actually reached OpenAI
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.session.instructions).toContain('IELTS Speaking examiner');
  });

  it('refunds the decremented seconds when OpenAI minting fails', async () => {
    state.authUser = { id: 'u1' };
    state.meter = { allowed: true, remaining: 2760 };
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: { message: 'nope' } }) });
    const res = await call({ mode: 'part1' });
    expect(res.statusCode).toBe(502);
    expect(state.realtimeRefunds).toHaveLength(1);
    expect(state.realtimeRefunds[0]).toMatchObject({
      p_uid: 'u1',
      p_seconds: 300,
    });
    expect(state.realtimeRefunds[0].p_refund_key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(state.updates).toHaveLength(0);
  });

  it('uses the legacy refund only while the atomic RPC is not deployed', async () => {
    state.authUser = { id: 'u1' };
    state.meter = { allowed: true, remaining: 2760 };
    state.refundRpcError = { code: 'PGRST202', message: 'function not found' };
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: { message: 'nope' } }) });
    const res = await call({ mode: 'part1' });
    expect(res.statusCode).toBe(502);
    expect(state.realtimeRefunds).toHaveLength(1);
    expect(state.updates).toContainEqual({
      table: 'user_quotas',
      fields: { realtime_seconds_remaining: 300 },
    });
  });

  it('does not risk a double refund after an ambiguous RPC error', async () => {
    state.authUser = { id: 'u1' };
    state.meter = { allowed: true, remaining: 2760 };
    state.refundRpcError = { code: 'PGRST000', message: 'connection lost' };
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: { message: 'nope' } }) });
    const res = await call({ mode: 'part1' });
    expect(res.statusCode).toBe(502);
    expect(state.realtimeRefunds).toHaveLength(1);
    expect(state.updates).toHaveLength(0);
  });

  it('returns 429 when the per-IP mint limit trips', async () => {
    state.authUser = { id: 'u1' };
    state.rateLimit = false;
    const res = await call();
    expect(res.statusCode).toBe(429);
  });

  it('fails closed when the global mint limit trips', async () => {
    state.authUser = { id: 'u1' };
    state.rateLimits['realtime-mint-global'] = false;
    const res = await call();
    expect(res.statusCode).toBe(503);
  });

  it('fails closed when mint rate-limit infrastructure errors', async () => {
    state.authUser = { id: 'u1' };
    state.rateLimitError = { message: 'rate limiter unavailable' };
    const res = await call();
    expect(res.statusCode).toBe(503);
  });
});

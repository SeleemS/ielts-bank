// tests/live-examiner.test.js
// Unit tests for the Live examiner core (lib/liveExaminer.js,
// lib/liveSessionsApi.js) and the mint + SDP exchange route.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';
process.env.OPENAI_API_KEY = 'sk-test-dummy';

import {
  LIVE_MODEL,
  LIVE_BACKEND_MODEL,
  LIVE_VOICES,
  DEFAULT_LIVE_VOICE,
  resolveLiveVoice,
  buildLiveVoiceInstructions,
  buildLiveBackendInstructions,
  buildLiveSessionConfig,
} from '../lib/liveExaminer';
import { createLiveSession, hangupLiveSession } from '../lib/liveSessionsApi';

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

// ---------------------------------------------------------------------------
// lib
// ---------------------------------------------------------------------------
describe('liveExaminer lib', () => {
  it('defaults the delegated backend to the fast, cheap Live backend model', () => {
    expect(LIVE_BACKEND_MODEL).toBe('gpt-5.1');
  });

  it('exposes the documented voice enum and defaults to vesper', () => {
    expect(LIVE_VOICES).toContain('vesper');
    expect(LIVE_VOICES).toContain('marin');
    expect(DEFAULT_LIVE_VOICE).toBe('vesper');
    expect(resolveLiveVoice({ OPENAI_LIVE_VOICE: 'cedar' })).toBe('cedar');
    expect(resolveLiveVoice({ OPENAI_LIVE_VOICE: 'CEDAR' })).toBe('cedar');
  });

  it('falls back to the default for an unknown or missing voice', () => {
    expect(resolveLiveVoice({ OPENAI_LIVE_VOICE: 'chewbacca' })).toBe('vesper');
    expect(resolveLiveVoice({})).toBe('vesper');
    expect(resolveLiveVoice()).toBeTruthy();
  });

  it('prepends full-duplex conduct rules to the shared examiner plan', () => {
    const text = buildLiveVoiceInstructions('mock', items, 840);
    expect(text).toContain('LIVE AUDIO CONDUCT');
    expect(text).toContain('Greet the candidate IMMEDIATELY');
    expect(text).toContain('Never talk over the candidate');
    expect(text).toContain('a second or two of continuous silence');
    expect(text).not.toContain('three seconds');
    expect(text).toContain("Never read the backend's text out verbatim");
    // The shared plan still arrives intact.
    expect(text).toContain('PART 1');
    expect(text).toContain('PART 2');
    expect(text).toContain('PART 3');
    expect(text).toContain('Where is your hometown?');
  });

  it('tells the voice layer to ask planned questions itself and not delegate them', () => {
    const text = buildLiveVoiceInstructions('mock', items, 840);
    expect(text).toContain('Delegation policy');
    expect(text).toContain('You already have the complete session plan below');
    expect(text).toContain('Delegate to the backend when: the candidate asks something the session plan does not cover');
    const noDelegate = text.slice(text.indexOf('Do not delegate to the backend when:'));
    expect(noDelegate).toContain('greeting the candidate');
    expect(noDelegate).toContain('checking or confirming their name');
    expect(noDelegate).toContain('acknowledging what they just said');
    expect(noDelegate).toContain('moving on to the next planned question');
  });

  it('keeps drill instructions limited to the requested part', () => {
    const text = buildLiveVoiceInstructions('part2', items, 300);
    expect(text).toContain('PART 2');
    expect(text).not.toContain('PART 1 —');
    expect(text).not.toContain('PART 3 —');
  });

  it('tells the delegated backend to stay silent, short and unscored', () => {
    const text = buildLiveBackendInstructions('mock');
    expect(text).toContain('silent planning assistant');
    expect(text).toContain('AT MOST two short sentences');
    expect(text).toContain('Never score the candidate');
    expect(text).toContain('consulted ONLY when the candidate asks something off-plan');
  });

  it('builds the exact Live session body with a locked data channel', () => {
    const cfg = buildLiveSessionConfig({
      instructions: 'say the thing',
      backendInstructions: 'plan the thing',
      voice: 'vesper',
      sdp: 'v=0 offer',
    });
    expect(cfg.session.model).toBe(LIVE_MODEL);
    expect(cfg.session.instructions).toBe('say the thing');
    expect(cfg.session.audio.output.voice).toBe('vesper');
    // WebRTC rejects audio.format, and turn detection/transcription are native.
    expect(cfg.session.audio.input).toBeUndefined();
    expect(cfg.session.audio.output.format).toBeUndefined();
    expect(cfg.session.store).toBe(false);
    expect(cfg.transport).toEqual({ type: 'webrtc', sdp: 'v=0 offer' });

    const channel = cfg.session.client.data_channel;
    expect(channel.allowed_client_events).toEqual([
      'session.close',
      'session.input_audio.mute',
      'session.input_audio.unmute',
    ]);
    // No instruction-mutating event may be sent from the browser.
    expect(channel.allowed_client_events.join(' ')).not.toContain('instructions');
    expect(channel.allowed_server_events.map((e) => e.type)).toEqual([
      'session.started',
      'session.input_transcript.delta',
      'session.output_transcript.delta',
      'session.delegation.created',
      'session.usage.updated',
      'session.closed',
      'error',
      'info',
    ]);

    expect(cfg.session.delegation.type).toBe('responses');
    expect(cfg.session.delegation.responses).toMatchObject({
      model: LIVE_BACKEND_MODEL,
      instructions: 'plan the thing',
      max_output_tokens: 300,
      // Fast mode, so the rare off-plan delegation is as short as it can be.
      service_tier: 'priority',
      reasoning: { effort: 'low' },
      text: { verbosity: 'low' },
      tool_choice: 'none',
      tools: [],
    });
  });

  it('defaults the voice when none is supplied', () => {
    const cfg = buildLiveSessionConfig({ instructions: 'a', backendInstructions: 'b', sdp: 'c' });
    expect(cfg.session.audio.output.voice).toBe(DEFAULT_LIVE_VOICE);
  });
});

// ---------------------------------------------------------------------------
// liveSessionsApi
// ---------------------------------------------------------------------------
describe('liveSessionsApi', () => {
  it('creates a session and returns the id and answer SDP', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ session: { id: 'live_1' }, transport: { sdp: 'v=0 answer' } }),
    }));
    const result = await createLiveSession({ session: {}, transport: {} }, {
      fetchFn,
      apiKey: 'sk-x',
    });
    expect(result).toEqual({ sessionId: 'live_1', sdp: 'v=0 answer' });
    const [url, options] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/live/sessions');
    expect(options.headers.Authorization).toBe('Bearer sk-x');
    expect(options.signal).toBeTruthy();
  });

  it('throws with the provider status when creation fails', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'bad sdp' } }),
    }));
    await expect(
      createLiveSession({}, { fetchFn, apiKey: 'sk-x' })
    ).rejects.toMatchObject({ message: 'bad sdp', status: 400 });
  });

  it('throws when the answer SDP is missing', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ session: { id: 'live_1' } }),
    }));
    await expect(createLiveSession({}, { fetchFn, apiKey: 'sk-x' })).rejects.toThrow(
      /incomplete/
    );
  });

  it('hangs up a session', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200 }));
    const result = await hangupLiveSession('live_1', { fetchFn, apiKey: 'sk-x' });
    expect(result).toEqual({ ok: true, alreadyEnded: false });
    expect(fetchFn.mock.calls[0][0]).toBe(
      'https://api.openai.com/v1/live/sessions/live_1/hangup'
    );
    expect(fetchFn.mock.calls[0][1].method).toBe('POST');
  });

  it('treats an already-ended session as success', async () => {
    for (const status of [404, 410]) {
      const fetchFn = vi.fn(async () => ({ ok: false, status }));
      await expect(hangupLiveSession('live_1', { fetchFn, apiKey: 'sk-x' })).resolves.toEqual({
        ok: true,
        alreadyEnded: true,
      });
    }
  });

  it('throws on a real hangup failure so the caller can retry', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 500 }));
    await expect(
      hangupLiveSession('live_1', { fetchFn, apiKey: 'sk-x' })
    ).rejects.toMatchObject({ status: 500 });
  });
});

// ---------------------------------------------------------------------------
// mint route
// ---------------------------------------------------------------------------
const state = {
  authUser: null,
  authReject: null,
  meter: null,
  meterError: null,
  refundRpcError: null,
  rateLimit: true,
  rateLimitError: null,
  rateLimits: {},
  quotaRow: { realtime_seconds_remaining: 0, realtime_seconds_quota: 3600 },
  planRow: { plan: 'premium', plan_status: 'active', plan_renews_at: null, plan_expires_at: null, billing_pause_until: null },
  planError: null,
  updates: [],
  inserts: [],
  insertError: null,
  realtimeRefunds: [],
  speakingRows: [{ passage_id: 'p1', part: 1, part1_questions: { topic: 'T', questions: [] } }],
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => {
        if (state.authReject) throw state.authReject;
        return state.authUser
          ? { data: { user: state.authUser }, error: null }
          : { data: null, error: { message: 'bad token' } };
      },
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
            error: table === 'users' ? state.planError : null,
          }),
        };
        return chain;
      },
      insert: async (row) => {
        state.inserts.push({ table, row });
        return { error: table === 'live_examiner_sessions' ? state.insertError : null };
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
    status(c) { this.statusCode = c; return this; },
    json(b) { this.jsonBody = b; return this; },
    setHeader(k, v) { this.headers[k] = v; },
  };
}

describe('POST /api/live/session', () => {
  let fetchMock;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_LIVE_EXAMINER = 'true';
    state.authUser = null;
    state.authReject = null;
    state.meter = null;
    state.meterError = null;
    state.refundRpcError = null;
    state.rateLimit = true;
    state.rateLimitError = null;
    state.rateLimits = {};
    state.planRow = { plan: 'premium', plan_status: 'active', plan_renews_at: null, plan_expires_at: null, billing_pause_until: null };
    state.planError = null;
    state.updates = [];
    state.inserts = [];
    state.insertError = null;
    state.realtimeRefunds = [];
    vi.restoreAllMocks();
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ session: { id: 'live_abc' }, transport: { sdp: 'v=0 answer' } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_LIVE_EXAMINER;
  });

  async function call(
    body = { mode: 'mock', sdp: 'v=0 offer' },
    headers = { authorization: 'Bearer tok' }
  ) {
    const { default: handler } = await import('../pages/api/live/session');
    const res = makeRes();
    await handler(makeReq({ headers, body }), res);
    return res;
  }

  it('503s while the pilot flag is off', async () => {
    process.env.NEXT_PUBLIC_LIVE_EXAMINER = 'false';
    state.authUser = { id: 'u1' };
    const res = await call();
    expect(res.statusCode).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a non-POST method', async () => {
    const { default: handler } = await import('../pages/api/live/session');
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, socket: {} }, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it('rejects unauthenticated users', async () => {
    const res = await call({ mode: 'mock', sdp: 'v=0 offer' }, {});
    expect(res.statusCode).toBe(401);
  });

  it('fails safely when auth verification rejects', async () => {
    state.authReject = new Error('auth service unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call();
    expect(res.statusCode).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unknown modes', async () => {
    state.authUser = { id: 'u1' };
    const res = await call({ mode: 'karaoke', sdp: 'v=0 offer' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a missing or oversized SDP offer before metering', async () => {
    state.authUser = { id: 'u1' };
    expect((await call({ mode: 'mock' })).statusCode).toBe(400);
    expect((await call({ mode: 'mock', sdp: 'x'.repeat(200001) })).statusCode).toBe(400);
    expect(state.realtimeRefunds).toHaveLength(0);
  });

  it('402s a non-premium user with the upsell reason', async () => {
    state.authUser = { id: 'u1' };
    state.planRow = { plan: 'free', plan_status: 'inactive' };
    const res = await call();
    expect(res.statusCode).toBe(402);
    expect(res.jsonBody.reason).toBe('not_premium');
  });

  it('does not misreport an entitlement outage as non-premium', async () => {
    state.authUser = { id: 'u1' };
    state.planRow = null;
    state.planError = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call();
    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.reason).toBeUndefined();
  });

  it('402s when minutes are exhausted, with reset info', async () => {
    state.authUser = { id: 'u1' };
    state.meter = { allowed: false, remaining: 120, reason: 'minutes_exhausted', resetsAt: 'soon' };
    const res = await call();
    expect(res.statusCode).toBe(402);
    expect(res.jsonBody.remainingSeconds).toBe(120);
  });

  it('returns 429 when the per-IP mint limit trips', async () => {
    state.authUser = { id: 'u1' };
    state.rateLimit = false;
    const res = await call();
    expect(res.statusCode).toBe(429);
  });

  it('fails closed when the global mint limit trips', async () => {
    state.authUser = { id: 'u1' };
    state.rateLimits['live-mint-global'] = false;
    const res = await call();
    expect(res.statusCode).toBe(503);
  });

  it('fails closed when the rate-limit infrastructure errors', async () => {
    state.authUser = { id: 'u1' };
    state.rateLimitError = { message: 'rate limiter unavailable' };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call();
    expect(res.statusCode).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exchanges the SDP, records the session row and reports remaining minutes', async () => {
    state.authUser = { id: 'u1' };
    state.meter = { allowed: true, remaining: 2760, resetsAt: 'later' };
    const res = await call({ mode: 'mock', sdp: 'v=0 offer' });

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.sessionId).toBe('live_abc');
    expect(res.jsonBody.sdp).toBe('v=0 answer');
    expect(res.jsonBody.model).toBeTruthy();
    expect(res.jsonBody.voice).toBe('vesper');
    expect(res.jsonBody.durationSeconds).toBe(840);
    expect(res.jsonBody.remainingSeconds).toBe(2760);
    expect(res.jsonBody.assessment).toBeUndefined();

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.transport).toEqual({ type: 'webrtc', sdp: 'v=0 offer' });
    expect(sent.session.instructions).toContain('IELTS Speaking examiner');
    expect(sent.session.instructions).toContain('LIVE AUDIO CONDUCT');

    const sessionRow = state.inserts.find((i) => i.table === 'live_examiner_sessions');
    expect(sessionRow.row).toMatchObject({
      id: 'live_abc',
      user_id: 'u1',
      mode: 'mock',
      duration_seconds: 840,
    });
    // deadline = duration + 45 s grace
    const grace = new Date(sessionRow.row.deadline_at).getTime() - Date.now();
    expect(grace).toBeGreaterThan(880 * 1000);
    expect(grace).toBeLessThan(890 * 1000);

    const costRow = state.inserts.find((i) => i.table === 'ai_usage_costs');
    expect(costRow.row).toMatchObject({
      feature: 'speaking_live',
      operation: 'session_reservation',
      provider_request_id: 'live_abc',
      estimated: true,
    });
  });

  it('still returns the session when the tracking row insert fails', async () => {
    state.authUser = { id: 'u1' };
    state.meter = { allowed: true, remaining: 2760 };
    state.insertError = { message: 'unique violation' };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call();
    expect(res.statusCode).toBe(200);
  });

  it('refunds the decremented seconds when the provider call fails', async () => {
    state.authUser = { id: 'u1' };
    state.meter = { allowed: true, remaining: 2760 };
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'nope' } }),
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call({ mode: 'part1', sdp: 'v=0 offer' });

    expect(res.statusCode).toBe(502);
    expect(state.realtimeRefunds).toHaveLength(1);
    expect(state.realtimeRefunds[0]).toMatchObject({ p_uid: 'u1', p_seconds: 300 });
    expect(state.realtimeRefunds[0].p_refund_key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(state.inserts.filter((i) => i.table === 'live_examiner_sessions')).toHaveLength(0);
  });

  it('uses the legacy refund only while the atomic RPC is not deployed', async () => {
    state.authUser = { id: 'u1' };
    state.meter = { allowed: true, remaining: 2760 };
    state.refundRpcError = { code: 'PGRST202', message: 'function not found' };
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call({ mode: 'part1', sdp: 'v=0 offer' });
    expect(res.statusCode).toBe(502);
    expect(state.updates).toContainEqual({
      table: 'user_quotas',
      fields: { realtime_seconds_remaining: 300 },
    });
  });

  it('does not risk a double refund after an ambiguous RPC error', async () => {
    state.authUser = { id: 'u1' };
    state.meter = { allowed: true, remaining: 2760 };
    state.refundRpcError = { code: 'PGRST000', message: 'connection lost' };
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call({ mode: 'part1', sdp: 'v=0 offer' });
    expect(res.statusCode).toBe(502);
    expect(state.updates).toHaveLength(0);
  });

  it('503s an audio-assessment request while that pilot flag is off', async () => {
    state.authUser = { id: 'u1' };
    state.meter = { allowed: true, remaining: 2760 };
    const res = await call({ mode: 'mock', sdp: 'v=0 offer', audioAssessment: true });
    expect(res.statusCode).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('issues an assessment ticket when the audio pilot is enabled', async () => {
    process.env.NEXT_PUBLIC_REALTIME_AUDIO_ASSESSMENT = 'true';
    process.env.REALTIME_ASSESSMENT_SECRET = 'x'.repeat(48);
    state.authUser = { id: 'u1' };
    state.meter = { allowed: true, remaining: 2760 };
    const res = await call({ mode: 'mock', sdp: 'v=0 offer', audioAssessment: true });
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.assessment.ticket).toContain('.');
    delete process.env.NEXT_PUBLIC_REALTIME_AUDIO_ASSESSMENT;
    delete process.env.REALTIME_ASSESSMENT_SECRET;
  });
});

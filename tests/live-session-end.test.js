// tests/live-session-end.test.js
// POST /api/live/session/end: ownership, hangup idempotency, usage recording,
// and the retry contract (a failed hangup must leave ended_at null so the
// cron sweep tries again).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';
process.env.OPENAI_API_KEY = 'sk-test-dummy';

const state = {
  authUser: null,
  sessionRow: null,
  sessionError: null,
  updates: [],
  inserts: [],
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () =>
        state.authUser
          ? { data: { user: state.authUser }, error: null }
          : { data: null, error: { message: 'bad token' } },
    },
    from: (table) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.sessionRow, error: state.sessionError }),
        }),
      }),
      insert: async (row) => {
        state.inserts.push({ table, row });
        return { error: null };
      },
      update: (fields) => ({
        eq: async (_col, value) => {
          state.updates.push({ table, fields, id: value });
          return { error: null };
        },
      }),
    }),
  }),
}));

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

async function call(body, headers = { authorization: 'Bearer tok' }) {
  const { default: handler } = await import('../pages/api/live/session/end');
  const res = makeRes();
  await handler({ method: 'POST', headers, body, socket: { remoteAddress: '127.0.0.1' } }, res);
  return res;
}

describe('POST /api/live/session/end', () => {
  let fetchMock;
  beforeEach(() => {
    state.authUser = { id: 'u1' };
    state.sessionRow = {
      id: 'live_abc',
      user_id: 'u1',
      mode: 'mock',
      duration_seconds: 840,
      ended_at: null,
    };
    state.sessionError = null;
    state.updates = [];
    state.inserts = [];
    vi.restoreAllMocks();
    fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('rejects a non-POST method', async () => {
    const { default: handler } = await import('../pages/api/live/session/end');
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, socket: {} }, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it('401s without auth', async () => {
    state.authUser = null;
    const res = await call({ sessionId: 'live_abc' }, {});
    expect(res.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('400s without a session id', async () => {
    const res = await call({});
    expect(res.statusCode).toBe(400);
  });

  it('404s a session belonging to another user', async () => {
    state.sessionRow = { ...state.sessionRow, user_id: 'someone-else' };
    const res = await call({ sessionId: 'live_abc' });
    expect(res.statusCode).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('404s a missing session', async () => {
    state.sessionRow = null;
    const res = await call({ sessionId: 'live_abc' });
    expect(res.statusCode).toBe(404);
  });

  it('hangs up, marks the row ended and records a usage row', async () => {
    const res = await call({ sessionId: 'live_abc', usageSeconds: 512, reason: 'timer' });

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ ended: true });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.openai.com/v1/live/sessions/live_abc/hangup'
    );
    expect(state.updates[0].fields).toMatchObject({
      end_reason: 'timer',
      client_usage_seconds: 512,
    });
    expect(state.updates[0].fields.ended_at).toBeTruthy();

    const cost = state.inserts.find((i) => i.table === 'ai_usage_costs');
    expect(cost.row).toMatchObject({
      feature: 'speaking_live',
      operation: 'session_usage',
      audio_seconds: 512,
      estimated: true,
    });
    expect(cost.row.metadata.source).toBe('client_reported');
    expect(cost.row.cost_usd).toBeCloseTo((512 / 60) * 0.05, 8);
  });

  it('caps client-reported usage at the reserved duration plus grace', async () => {
    await call({ sessionId: 'live_abc', usageSeconds: 999999 });
    const cost = state.inserts.find((i) => i.table === 'ai_usage_costs');
    expect(cost.row.audio_seconds).toBe(870);
  });

  it('falls back to the capped duration when usage is missing or invalid', async () => {
    await call({ sessionId: 'live_abc', usageSeconds: 'lots' });
    const cost = state.inserts.find((i) => i.table === 'ai_usage_costs');
    expect(cost.row.audio_seconds).toBe(870);
  });

  it('sanitises a malformed end reason', async () => {
    await call({ sessionId: 'live_abc', usageSeconds: 10, reason: 'Robert; DROP TABLE' });
    expect(state.updates[0].fields.end_reason).toBe('client_end');
  });

  it('treats an already-ended provider session as success', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    const res = await call({ sessionId: 'live_abc', usageSeconds: 30 });
    expect(res.statusCode).toBe(200);
    expect(state.updates).toHaveLength(1);
  });

  it('does not double-bill a session that was already ended in our ledger', async () => {
    state.sessionRow = { ...state.sessionRow, ended_at: '2026-09-10T00:00:00.000Z' };
    const res = await call({ sessionId: 'live_abc', usageSeconds: 30 });
    expect(res.statusCode).toBe(200);
    expect(state.inserts.filter((i) => i.table === 'ai_usage_costs')).toHaveLength(0);
  });

  it('502s and leaves the row open when hangup genuinely fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call({ sessionId: 'live_abc', usageSeconds: 30 });
    expect(res.statusCode).toBe(502);
    expect(state.updates).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
  });
});

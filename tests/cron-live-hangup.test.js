// tests/cron-live-hangup.test.js
// GET /api/cron/live-hangup: the safety net that stops the per-second Live
// meter when the browser never told us the session ended.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  rows: [],
  queryError: null,
  updates: [],
  filters: null,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => {
        const chain = {
          is: (col, value) => { state.filters = { ...state.filters, is: [col, value] }; return chain; },
          lt: (col) => { state.filters = { ...state.filters, lt: col }; return chain; },
          limit: async (n) => {
            state.filters = { ...state.filters, limit: n };
            return state.queryError
              ? { data: null, error: state.queryError }
              : { data: state.rows, error: null };
          },
        };
        return chain;
      },
      update: (fields) => ({
        eq: async (_col, id) => {
          state.updates.push({ id, fields });
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
    ended: false,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.jsonBody = b; return this; },
    end() { this.ended = true; return this; },
    setHeader(k, v) { this.headers[k] = v; },
  };
}

async function call(headers = { authorization: 'Bearer cron-secret' }, method = 'GET') {
  const { default: handler } = await import('../pages/api/cron/live-hangup');
  const res = makeRes();
  await handler({ method, headers }, res);
  return res;
}

describe('GET /api/cron/live-hangup', () => {
  let fetchMock;
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';
    process.env.OPENAI_API_KEY = 'sk-test-dummy';
    state.rows = [];
    state.queryError = null;
    state.updates = [];
    state.filters = null;
    vi.restoreAllMocks();
    fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns 405 with the supported method in Allow', async () => {
    const res = await call({}, 'POST');
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
    expect(res.ended).toBe(true);
  });

  it('401s without the cron secret', async () => {
    const res = await call({});
    expect(res.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('selects only open sessions past their deadline, in batches of 50', async () => {
    await call();
    expect(state.filters.is).toEqual(['ended_at', null]);
    expect(state.filters.lt).toBe('deadline_at');
    expect(state.filters.limit).toBe(50);
  });

  it('hangs up overdue sessions and marks them swept', async () => {
    state.rows = [
      { id: 'live_1', hangup_attempts: 0 },
      { id: 'live_2', hangup_attempts: 2 },
    ];
    const res = await call();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.jsonBody).toMatchObject({ scanned: 2, hungUp: 2, failed: 0, abandoned: 0 });
    expect(state.updates[0].fields).toMatchObject({
      end_reason: 'deadline_sweep',
      hangup_attempts: 1,
    });
    expect(state.updates[1].fields.hangup_attempts).toBe(3);
  });

  it('counts a session OpenAI already ended as swept', async () => {
    state.rows = [{ id: 'live_1', hangup_attempts: 0 }];
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    const res = await call();
    expect(res.jsonBody).toMatchObject({ hungUp: 1, alreadyEnded: 1 });
    expect(state.updates[0].fields.end_reason).toBe('deadline_sweep');
  });

  it('retries a failed hangup by leaving the row open', async () => {
    state.rows = [{ id: 'live_1', hangup_attempts: 1 }];
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call();
    expect(res.jsonBody).toMatchObject({ failed: 1, hungUp: 0 });
    expect(state.updates[0].fields).toEqual({ hangup_attempts: 2 });
  });

  it('gives up after five attempts and flags the row', async () => {
    state.rows = [{ id: 'live_1', hangup_attempts: 4 }];
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call();
    expect(res.jsonBody).toMatchObject({ abandoned: 1 });
    expect(state.updates[0].fields).toMatchObject({
      end_reason: 'hangup_failed',
      hangup_attempts: 5,
    });
    expect(state.updates[0].fields.ended_at).toBeTruthy();
  });

  it('503s when the query fails rather than reporting a clean sweep', async () => {
    state.queryError = { message: 'connection lost' };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call();
    expect(res.statusCode).toBe(503);
  });

  it('503s when the OpenAI key is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    const res = await call();
    expect(res.statusCode).toBe(503);
    process.env.OPENAI_API_KEY = 'sk-test-dummy';
  });
});

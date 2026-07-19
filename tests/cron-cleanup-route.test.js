import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'CRON_SECRET',
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
];
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]])
);

const state = {
  clientCreations: 0,
  clientError: null,
  fromCalls: [],
  rateError: null,
  rateReject: null,
  rateDeletes: [],
  userError: null,
  userReject: null,
  users: [],
  userQueries: [],
  listResponses: {},
  listRejects: {},
  listCalls: [],
  removeResponses: [],
  removeRejects: [],
  removeCalls: [],
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    state.clientCreations += 1;
    if (state.clientError) throw state.clientError;
    return {
      from(table) {
        state.fromCalls.push(table);
        if (table === 'rate_limits') {
          return {
            delete: () => ({
              lt: async (column, cutoff) => {
                state.rateDeletes.push({ column, cutoff });
                if (state.rateReject) throw state.rateReject;
                return { error: state.rateError };
              },
            }),
          };
        }
        if (table === 'users') {
          return {
            select: (columns) => ({
              limit: async (limit) => {
                state.userQueries.push({ columns, limit });
                if (state.userReject) throw state.userReject;
                return { data: state.users, error: state.userError };
              },
            }),
          };
        }
        throw new Error(`unexpected-table:${table}`);
      },
      storage: {
        from(bucket) {
          return {
            async list(prefix, options) {
              state.listCalls.push({ bucket, prefix, options });
              if (state.listRejects[prefix]) throw state.listRejects[prefix];
              return state.listResponses[prefix] || { data: [], error: null };
            },
            async remove(paths) {
              state.removeCalls.push({ bucket, paths });
              const rejection = state.removeRejects.shift();
              if (rejection) throw rejection;
              return state.removeResponses.shift() || { data: paths, error: null };
            },
          };
        },
      },
    };
  },
}));

import handler from '../pages/api/cron/cleanup';

function makeReq({ method = 'GET', authorization = 'Bearer cron-test' } = {}) {
  return { method, headers: authorization ? { authorization } : {} };
}

function makeRes() {
  return {
    statusCode: null,
    jsonBody: null,
    headers: {},
    ended: false,
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
    end() {
      this.ended = true;
      return this;
    },
  };
}

async function callRoute(options) {
  const res = makeRes();
  await handler(makeReq(options), res);
  return res;
}

describe('GET /api/cron/cleanup', () => {
  afterAll(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.CRON_SECRET = 'cron-test';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';
    state.clientCreations = 0;
    state.clientError = null;
    state.fromCalls = [];
    state.rateError = null;
    state.rateReject = null;
    state.rateDeletes = [];
    state.userError = null;
    state.userReject = null;
    state.users = [];
    state.userQueries = [];
    state.listResponses = {};
    state.listRejects = {};
    state.listCalls = [];
    state.removeResponses = [];
    state.removeRejects = [];
    state.removeCalls = [];
  });

  it('rejects unsupported methods before authentication or dependencies', async () => {
    const res = await callRoute({ method: 'POST', authorization: null });

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
    expect(res.ended).toBe(true);
    expect(state.clientCreations).toBe(0);
  });

  it('requires the configured bearer secret before creating an admin client', async () => {
    const missing = await callRoute({ authorization: null });
    const wrong = await callRoute({ authorization: 'Bearer wrong' });

    expect([missing.statusCode, wrong.statusCode]).toEqual([401, 401]);
    expect(state.clientCreations).toBe(0);
  });

  it('returns a controlled error when the database client is not configured', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Cleanup is not configured.' });
    expect(state.clientCreations).toBe(0);
  });

  it('returns a controlled error when admin-client construction throws', async () => {
    state.clientError = new Error('invalid configuration');

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Cleanup is not configured.' });
    expect(state.clientCreations).toBe(1);
  });

  it('stops before upload work when stale rate-limit deletion fails', async () => {
    state.rateError = { message: 'database unavailable' };

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Rate-limit cleanup failed.' });
    expect(state.userQueries).toEqual([]);
    expect(state.listCalls).toEqual([]);
  });

  it('recovers when stale rate-limit deletion rejects', async () => {
    state.rateReject = new Error('network unavailable');

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Rate-limit cleanup failed.' });
    expect(state.userQueries).toEqual([]);
  });

  it('stops before storage work when the user query fails', async () => {
    state.userError = { message: 'users unavailable' };

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Upload cleanup failed.' });
    expect(state.userQueries).toEqual([{ columns: 'id', limit: 5000 }]);
    expect(state.listCalls).toEqual([]);
  });

  it('recovers when the user query rejects', async () => {
    state.userReject = new Error('network unavailable');

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Upload cleanup failed.' });
    expect(state.listCalls).toEqual([]);
  });

  it('fails the run when a storage listing fails', async () => {
    state.users = [{ id: 'user-1' }];
    state.listResponses['user-1'] = {
      data: null,
      error: { message: 'storage unavailable' },
    };

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Upload cleanup failed.' });
    expect(state.removeCalls).toEqual([]);
  });

  it('recovers when a storage listing rejects', async () => {
    state.users = [{ id: 'user-1' }];
    state.listRejects['user-1'] = new Error('storage network unavailable');

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Upload cleanup failed.' });
    expect(state.removeCalls).toEqual([]);
  });

  it('fails the run when removal of an expired recording fails', async () => {
    state.users = [{ id: 'user-1' }];
    state.listResponses['user-1'] = {
      data: [{ name: 'expired.webm', created_at: '2020-01-01T00:00:00.000Z' }],
      error: null,
    };
    state.removeResponses = [
      { data: null, error: { message: 'delete unavailable' } },
    ];

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Upload cleanup failed.' });
    expect(state.removeCalls).toEqual([
      { bucket: 'speaking-uploads', paths: ['user-1/expired.webm'] },
    ]);
  });

  it('recovers when removal of an expired recording rejects', async () => {
    state.users = [{ id: 'user-1' }];
    state.listResponses['user-1'] = {
      data: [{ name: 'expired.webm', created_at: '2020-01-01T00:00:00.000Z' }],
      error: null,
    };
    state.removeRejects = [new Error('storage network unavailable')];

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Upload cleanup failed.' });
    expect(state.removeCalls).toHaveLength(1);
  });

  it('removes only expired recordings and reports the exact successful count', async () => {
    state.users = [{ id: 'user-1' }, { id: 'user-2' }];
    state.listResponses['user-1'] = {
      data: [
        { name: 'old-a.webm', created_at: '2020-01-01T00:00:00.000Z' },
        { name: 'current.webm', created_at: '2099-01-01T00:00:00.000Z' },
      ],
      error: null,
    };
    state.listResponses['user-2'] = {
      data: [{ name: 'old-b.webm', updated_at: '2020-01-01T00:00:00.000Z' }],
      error: null,
    };

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ ok: true, recordingsRemoved: 2 });
    expect(state.rateDeletes).toHaveLength(1);
    expect(state.rateDeletes[0].column).toBe('window_start');
    expect(Date.parse(state.rateDeletes[0].cutoff)).toBeGreaterThan(0);
    expect(state.listCalls).toEqual([
      { bucket: 'speaking-uploads', prefix: 'user-1', options: { limit: 1000 } },
      { bucket: 'speaking-uploads', prefix: 'user-2', options: { limit: 1000 } },
    ]);
    expect(state.removeCalls).toEqual([
      { bucket: 'speaking-uploads', paths: ['user-1/old-a.webm'] },
      { bucket: 'speaking-uploads', paths: ['user-2/old-b.webm'] },
    ]);
  });
});

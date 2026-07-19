import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';

const state = {
  user: null,
  authReject: null,
  premium: { isPremium: false, error: null },
  mock: null,
  mockLoads: 0,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => {
        if (state.authReject) throw state.authReject;
        return state.user
          ? { data: { user: state.user }, error: null }
          : { data: null, error: { message: 'invalid token' } };
      },
    },
  }),
}));

vi.mock('../lib/premium', () => ({
  fetchPremiumStatus: async () => state.premium,
}));

vi.mock('../lib/supabase', () => ({
  getMockTest: async () => {
    state.mockLoads += 1;
    return state.mock;
  },
}));

function makeReq({ method = 'GET', token = '', slug = 'academic-reading-mock-1' } = {}) {
  return {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    query: { slug },
  };
}

function makeRes() {
  return {
    statusCode: null,
    jsonBody: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    },
  };
}

async function callRoute(options) {
  const { default: handler } = await import('../pages/api/mock/[slug]');
  const res = makeRes();
  await handler(makeReq(options), res);
  return res;
}

beforeEach(() => {
  state.user = null;
  state.authReject = null;
  state.premium = { isPremium: false, error: null };
  state.mock = null;
  state.mockLoads = 0;
  vi.restoreAllMocks();
});

describe('GET /api/mock/[slug]', () => {
  it('rejects anonymous and free users before loading protected content', async () => {
    let res = await callRoute();
    expect(res.statusCode).toBe(401);

    state.user = { id: 'user-1' };
    res = await callRoute({ token: 'valid-token' });
    expect(res.statusCode).toBe(402);
    expect(res.jsonBody.reason).toBe('premium_required');
    expect(state.mockLoads).toBe(0);
  });

  it('returns a retryable response when auth verification rejects', async () => {
    state.authReject = new Error('auth service unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute({ token: 'valid-token' });

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/try again/i);
    expect(state.mockLoads).toBe(0);
  });

  it('does not misreport entitlement lookup failure as Premium required', async () => {
    state.user = { id: 'user-1' };
    state.premium = {
      isPremium: false,
      error: new Error('database unavailable'),
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute({ token: 'valid-token' });

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.reason).toBeUndefined();
    expect(state.mockLoads).toBe(0);
  });

  it('rejects invalid slugs for a Premium user', async () => {
    state.user = { id: 'user-1' };
    state.premium = { isPremium: true, error: null };
    const res = await callRoute({ token: 'valid-token', slug: '../private' });
    expect(res.statusCode).toBe(400);
  });

  it('returns full mock content only to Premium with private no-store caching', async () => {
    state.user = { id: 'user-1' };
    state.premium = { isPremium: true, error: null };
    state.mock = {
      slug: 'academic-reading-mock-1',
      sections: [{ title: 'Section 1', questions: [{ id: 'q1' }] }],
    };
    const res = await callRoute({ token: 'valid-token' });
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.mock.sections).toHaveLength(1);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(state.mockLoads).toBe(1);
  });
});

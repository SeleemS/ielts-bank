import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';

const state = {
  user: null,
  premium: false,
  mock: null,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () =>
        state.user
          ? { data: { user: state.user }, error: null }
          : { data: null, error: { message: 'invalid token' } },
    },
  }),
}));

vi.mock('../lib/premium', () => ({
  fetchIsPremium: async () => state.premium,
}));

vi.mock('../lib/supabase', () => ({
  getMockTest: async () => state.mock,
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
  state.premium = false;
  state.mock = null;
});

describe('GET /api/mock/[slug]', () => {
  it('rejects anonymous and free users before loading protected content', async () => {
    let res = await callRoute();
    expect(res.statusCode).toBe(401);

    state.user = { id: 'user-1' };
    res = await callRoute({ token: 'valid-token' });
    expect(res.statusCode).toBe(402);
    expect(res.jsonBody.reason).toBe('premium_required');
  });

  it('rejects invalid slugs for a Premium user', async () => {
    state.user = { id: 'user-1' };
    state.premium = true;
    const res = await callRoute({ token: 'valid-token', slug: '../private' });
    expect(res.statusCode).toBe(400);
  });

  it('returns full mock content only to Premium with private no-store caching', async () => {
    state.user = { id: 'user-1' };
    state.premium = true;
    state.mock = {
      slug: 'academic-reading-mock-1',
      sections: [{ title: 'Section 1', questions: [{ id: 'q1' }] }],
    };
    const res = await callRoute({ token: 'valid-token' });
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.mock.sections).toHaveLength(1);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ANON_ID = '11111111-1111-4111-8111-111111111111';
const ROW = {
  id: '22222222-2222-4222-8222-222222222222',
  essay: 'A short diagnostic writing sample.',
  word_count: 90,
  writing_band: 6,
  result: {
    criteria: {
      taskResponse: { band: 6, improvements: ['Develop the example.'] },
      coherenceCohesion: { band: 6, improvements: ['Link the ideas.'] },
    },
    summary: 'A relevant response.',
    improvements: ['Use more precise vocabulary.'],
    correctedExamples: [],
  },
  model: 'test-model',
  created_at: '2026-07-21T00:00:00.000Z',
  claimed_by_user_id: null,
};

const state = {
  authUser: { id: USER_ID, is_anonymous: false },
  authError: null,
  lookupRows: [],
  lookupError: null,
  claimResult: { data: { id: ROW.id }, error: null },
  claimUpdates: [],
  claimNullFilters: [],
  attempts: [],
  scores: [],
  premium: { isPremium: false, error: null },
};

function estimatorLookup() {
  const query = {
    eq: () => query,
    gte: () => query,
    order: () => query,
    limit: async () => ({ data: state.lookupRows, error: state.lookupError }),
  };
  return query;
}

function estimatorClaim(values) {
  state.claimUpdates.push(values);
  const query = {
    eq: () => query,
    is: (column, value) => {
      state.claimNullFilters.push({ column, value });
      return query;
    },
    select: () => query,
    maybeSingle: async () => state.claimResult,
  };
  return query;
}

const admin = {
  auth: {
    getUser: async () => ({ data: { user: state.authUser }, error: state.authError }),
  },
  from: (table) => {
    if (table === 'estimator_writing_scores') {
      return {
        select: () => estimatorLookup(),
        update: (values) => estimatorClaim(values),
      };
    }
    if (table === 'attempts') {
      return {
        insert: (values) => {
          state.attempts.push(values);
          return {
            select: () => ({
              single: async () => ({ data: { id: 'attempt-1' }, error: null }),
            }),
          };
        },
        delete: () => ({ eq: async () => ({ error: null }) }),
      };
    }
    if (table === 'scores') {
      return {
        insert: async (values) => {
          state.scores.push(values);
          return { error: null };
        },
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  },
};

vi.mock('@supabase/supabase-js', () => ({ createClient: () => admin }));
vi.mock('../lib/premium', () => ({ fetchPremiumStatus: async () => state.premium }));

const { default: handler } = await import('../pages/api/estimator/reveal.js');

function mockReq(body = { anon_id: ANON_ID }, authorization = 'Bearer test-token') {
  return {
    method: 'POST',
    headers: { origin: 'https://www.ielts-bank.com', authorization },
    body,
  };
}

function mockRes() {
  return {
    statusCode: 0,
    body: null,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

beforeEach(() => {
  state.authUser = { id: USER_ID, is_anonymous: false };
  state.authError = null;
  state.lookupRows = [{ ...ROW }];
  state.lookupError = null;
  state.claimResult = { data: { id: ROW.id }, error: null };
  state.claimUpdates = [];
  state.claimNullFilters = [];
  state.attempts = [];
  state.scores = [];
  state.premium = { isPremium: false, error: null };
});

describe('POST /api/estimator/reveal', () => {
  it('claims an unowned result atomically before revealing and mirroring it', async () => {
    const res = mockRes();
    await handler(mockReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ band: 6, wordCount: 90, premium: false });
    expect(state.claimUpdates).toHaveLength(1);
    expect(state.claimUpdates[0]).toMatchObject({ claimed_by_user_id: USER_ID });
    expect(state.claimNullFilters).toEqual([{ column: 'claimed_by_user_id', value: null }]);
    expect(state.attempts).toHaveLength(1);
    expect(state.scores).toHaveLength(1);
  });

  it('fails closed when the ownership claim returns a database error', async () => {
    state.claimResult = { data: null, error: { message: 'database unavailable' } };
    const res = mockRes();
    await handler(mockReq(), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'Could not save this result to your account. Please try again.' });
    expect(state.attempts).toHaveLength(0);
    expect(state.scores).toHaveLength(0);
  });

  it('does not reveal or mirror a result when another claimant wins the race', async () => {
    state.claimResult = { data: null, error: null };
    const res = mockRes();
    await handler(mockReq(), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'This estimator result has already been claimed.' });
    expect(state.attempts).toHaveLength(0);
    expect(state.scores).toHaveLength(0);
  });

  it('allows an idempotent re-reveal only for the same user', async () => {
    state.lookupRows = [{ ...ROW, claimed_by_user_id: USER_ID }];
    const res = mockRes();
    await handler(mockReq(), res);

    expect(res.statusCode).toBe(200);
    expect(state.claimUpdates).toHaveLength(0);
    expect(state.attempts).toHaveLength(0);
    expect(state.scores).toHaveLength(0);
  });

  it('does not expose a result already claimed by another user', async () => {
    state.lookupRows = [{ ...ROW, claimed_by_user_id: OTHER_USER_ID }];
    const res = mockRes();
    await handler(mockReq(), res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'No estimator writing sample found for this device.' });
    expect(state.claimUpdates).toHaveLength(0);
  });

  it('requires a non-anonymous authenticated user', async () => {
    state.authUser = null;
    const res = mockRes();
    await handler(mockReq(), res);

    expect(res.statusCode).toBe(401);
    expect(state.claimUpdates).toHaveLength(0);
  });
});

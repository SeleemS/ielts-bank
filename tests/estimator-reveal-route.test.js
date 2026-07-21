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
  attemptInsertCalls: [],
  attemptInsertError: null,
  scores: [],
  scoreInsertCalls: [],
  scoreInsertError: null,
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

function containsObject(actual, expected) {
  return Object.entries(expected).every(([key, value]) => actual?.[key] === value);
}

function attemptLookup() {
  const filters = [];
  const query = {
    eq: (column, value) => {
      filters.push((row) => row[column] === value);
      return query;
    },
    contains: (column, value) => {
      filters.push((row) => containsObject(row[column], value));
      return query;
    },
    limit: () => query,
    maybeSingle: async () => ({
      data: state.attempts.find((row) => filters.every((filter) => filter(row))) || null,
      error: null,
    }),
  };
  return query;
}

function scoreLookup() {
  const filters = [];
  const query = {
    eq: (column, value) => {
      filters.push((row) => row[column] === value);
      return query;
    },
    limit: () => query,
    maybeSingle: async () => ({
      data: state.scores.find((row) => filters.every((filter) => filter(row))) || null,
      error: null,
    }),
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
        select: () => attemptLookup(),
        insert: (values) => {
          state.attemptInsertCalls.push(values);
          return {
            select: () => ({
              single: async () => {
                if (state.attemptInsertError) {
                  return { data: null, error: state.attemptInsertError };
                }
                if (state.attempts.some((attempt) => attempt.id === values.id)) {
                  return { data: null, error: { code: '23505', message: 'duplicate key' } };
                }
                state.attempts.push(values);
                return { data: values, error: null };
              },
            }),
          };
        },
      };
    }
    if (table === 'scores') {
      return {
        select: () => scoreLookup(),
        insert: async (values) => {
          state.scoreInsertCalls.push(values);
          if (state.scoreInsertError) return { error: state.scoreInsertError };
          if (state.scores.some((score) => score.id === values.id)) {
            return { error: { code: '23505', message: 'duplicate key' } };
          }
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
  state.attemptInsertCalls = [];
  state.attemptInsertError = null;
  state.scores = [];
  state.scoreInsertCalls = [];
  state.scoreInsertError = null;
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
    expect(state.attempts[0].id).toBe(ROW.id);
    expect(state.attempts[0].responses.estimatorScoreId).toBe(ROW.id);
    expect(state.scores).toHaveLength(1);
    expect(state.scores[0]).toMatchObject({ id: ROW.id, attempt_id: ROW.id });
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

  it('repairs missing history on a same-user re-reveal without reclaiming the result', async () => {
    state.lookupRows = [{ ...ROW, claimed_by_user_id: USER_ID }];
    const res = mockRes();
    await handler(mockReq(), res);

    expect(res.statusCode).toBe(200);
    expect(state.claimUpdates).toHaveLength(0);
    expect(state.attempts).toHaveLength(1);
    expect(state.scores).toHaveLength(1);
  });

  it('does not duplicate history when the same user reveals the result again', async () => {
    state.lookupRows = [{ ...ROW, claimed_by_user_id: USER_ID }];
    const first = mockRes();
    const second = mockRes();
    await handler(mockReq(), first);
    await handler(mockReq(), second);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(state.attempts).toHaveLength(1);
    expect(state.scores).toHaveLength(1);
    expect(state.attemptInsertCalls).toHaveLength(1);
    expect(state.scoreInsertCalls).toHaveLength(1);
  });

  it('uses deterministic primary keys to collapse concurrent same-user reveals', async () => {
    state.lookupRows = [{ ...ROW, claimed_by_user_id: USER_ID }];
    const first = mockRes();
    const second = mockRes();
    await Promise.all([handler(mockReq(), first), handler(mockReq(), second)]);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(state.attempts).toHaveLength(1);
    expect(state.scores).toHaveLength(1);
    expect(state.attempts[0].id).toBe(ROW.id);
    expect(state.scores[0].id).toBe(ROW.id);
  });

  it('fails closed and retries a transient history score failure', async () => {
    state.lookupRows = [{ ...ROW, claimed_by_user_id: USER_ID }];
    state.scoreInsertError = { message: 'database unavailable' };
    const failed = mockRes();
    await handler(mockReq(), failed);

    expect(failed.statusCode).toBe(503);
    expect(failed.body).toEqual({
      error: 'Could not save this result to your history. Please try again.',
    });
    expect(failed.body).not.toHaveProperty('band');
    expect(state.attempts).toHaveLength(1);
    expect(state.scores).toHaveLength(0);

    state.scoreInsertError = null;
    const retried = mockRes();
    await handler(mockReq(), retried);

    expect(retried.statusCode).toBe(200);
    expect(retried.body).toMatchObject({ band: 6, premium: false });
    expect(state.attempts).toHaveLength(1);
    expect(state.scores).toHaveLength(1);
    expect(state.attemptInsertCalls).toHaveLength(1);
  });

  it('fails closed and retries a transient history attempt failure', async () => {
    state.lookupRows = [{ ...ROW, claimed_by_user_id: USER_ID }];
    state.attemptInsertError = { message: 'database unavailable' };
    const failed = mockRes();
    await handler(mockReq(), failed);

    expect(failed.statusCode).toBe(503);
    expect(failed.body).toEqual({
      error: 'Could not save this result to your history. Please try again.',
    });
    expect(state.attempts).toHaveLength(0);
    expect(state.scores).toHaveLength(0);

    state.attemptInsertError = null;
    const retried = mockRes();
    await handler(mockReq(), retried);

    expect(retried.statusCode).toBe(200);
    expect(state.attempts).toHaveLength(1);
    expect(state.scores).toHaveLength(1);
  });

  it('reuses a legacy estimator history row instead of duplicating it', async () => {
    state.lookupRows = [{ ...ROW, claimed_by_user_id: USER_ID }];
    state.attempts = [
      {
        id: 'legacy-attempt',
        user_id: USER_ID,
        skill: 'writing',
        submitted_at: ROW.created_at,
        responses: { essay: ROW.essay, source: 'band-estimator', wordCount: ROW.word_count },
      },
    ];
    state.scores = [{ id: 'legacy-score', attempt_id: 'legacy-attempt', user_id: USER_ID }];
    const res = mockRes();
    await handler(mockReq(), res);

    expect(res.statusCode).toBe(200);
    expect(state.attempts).toHaveLength(1);
    expect(state.scores).toHaveLength(1);
    expect(state.attemptInsertCalls).toHaveLength(0);
    expect(state.scoreInsertCalls).toHaveLength(0);
  });

  it('fails closed instead of treating a plan lookup outage as verified Free', async () => {
    state.lookupRows = [{ ...ROW, claimed_by_user_id: USER_ID }];
    state.premium = { isPremium: false, error: { message: 'billing profile unavailable' } };
    const res = mockRes();
    await handler(mockReq(), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'Could not verify your plan. Please try again.' });
    expect(res.body).not.toHaveProperty('band');
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

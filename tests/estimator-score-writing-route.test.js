import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';
process.env.OPENAI_API_KEY = 'sk-test-dummy';

const state = {
  rateLimitResponses: [],
  inserts: [],
  insertError: null,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async (name) => {
      if (name === 'check_rate_limit') {
        const r = state.rateLimitResponses.shift();
        return r === undefined ? { data: true, error: null } : r;
      }
      return { data: null, error: null };
    },
    from: (table) => ({
      insert: (values) => {
        state.inserts.push({ table, values });
        return Promise.resolve({ error: state.insertError });
      },
    }),
  }),
}));

const SCORE = {
  overallBand: 6,
  criteria: {
    taskResponse: { band: 6, strengths: ['clear stance'], improvements: ['develop more'] },
    coherenceCohesion: { band: 6, strengths: ['logical'], improvements: ['link ideas'] },
    lexicalResource: { band: 6, strengths: ['adequate'], improvements: ['vary words'] },
    grammaticalRange: { band: 5.5, strengths: ['some complex'], improvements: ['fix agreement'] },
  },
  summary: 'A relevant paragraph with some control issues.',
  improvements: ['a', 'b', 'c'],
  correctedExamples: [],
};

let handler;

beforeEach(async () => {
  state.rateLimitResponses = [];
  state.inserts = [];
  state.insertError = null;
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(SCORE) } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }),
    text: async () => '',
  }));
  ({ default: handler } = await import('../pages/api/estimator/score-writing.js'));
});

afterEach(() => {
  delete global.fetch;
  vi.clearAllMocks();
});

function mockReq(body) {
  return { method: 'POST', headers: { origin: 'https://www.ielts-bank.com' }, body, socket: { remoteAddress: '1.2.3.4' } };
}
function mockRes() {
  return {
    statusCode: 0,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
  };
}

const ANON = '11111111-1111-4111-8111-111111111111';
const PARAGRAPH = Array.from({ length: 90 }, (_, i) => `word${i}`).join(' ');

describe('POST /api/estimator/score-writing', () => {
  it('scores anonymously and NEVER returns the band to the client', async () => {
    const req = mockReq({ anon_id: ANON, essay: PARAGRAPH });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ scored: true, wordCount: 90 });
    // The band and any scoring detail must NOT be in the response payload.
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/band|criteria|taskResponse|overall/i);
    // ...but it IS stored server-side with the computed band.
    const stored = state.inserts.find((i) => i.table === 'estimator_writing_scores');
    expect(stored).toBeTruthy();
    expect(stored.values.writing_band).toBe(6);
    expect(stored.values.anon_id).toBe(ANON);
  });

  it('rejects a missing/invalid anon_id', async () => {
    const res = mockRes();
    await handler(mockReq({ essay: PARAGRAPH }), res);
    expect(res.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects a too-short sample without calling the model', async () => {
    const res = mockRes();
    await handler(mockReq({ anon_id: ANON, essay: 'too short indeed' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('too_short');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects an over-long sample', async () => {
    const long = Array.from({ length: 200 }, (_, i) => `w${i}`).join(' ');
    const res = mockRes();
    await handler(mockReq({ anon_id: ANON, essay: long }), res);
    expect(res.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns 429 when a rate limit is hit, before calling the model', async () => {
    state.rateLimitResponses = [{ data: false, error: null }]; // global cap tripped
    const res = mockRes();
    await handler(mockReq({ anon_id: ANON, essay: PARAGRAPH }), res);
    expect(res.statusCode).toBe(429);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(state.inserts.find((i) => i.table === 'estimator_writing_scores')).toBeFalsy();
  });

  it('fails closed when the scored result cannot be stored', async () => {
    state.insertError = { message: 'database unavailable' };
    const res = mockRes();
    await handler(mockReq({ anon_id: ANON, essay: PARAGRAPH }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'Could not save your result. Please try again.' });
    expect(res.body).not.toHaveProperty('scored');
  });
});

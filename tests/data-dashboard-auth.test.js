import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';
process.env.DATA_DASHBOARD_PASSWORD = 'correct-horse-battery';

const state = {
  limitResponse: { data: true, error: null },
  rpcCalls: [],
  rpcResponse: { data: { totals: {} }, error: null },
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async (name, args) => {
      state.rpcCalls.push({ name, args });
      if (name === 'check_rate_limit') return state.limitResponse;
      return state.rpcResponse;
    },
  }),
}));

const {
  issueToken,
  tokenValid,
  passwordMatches,
  sessionCookie,
  DATA_SESSION_COOKIE,
} = await import('../lib/dataDashAuth');

function makeRes() {
  return {
    statusCode: null,
    jsonBody: null,
    headers: {},
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
  };
}

function authedCookieHeader() {
  return `${DATA_SESSION_COOKIE}=${encodeURIComponent(issueToken())}`;
}

beforeEach(() => {
  state.limitResponse = { data: true, error: null };
  state.rpcCalls = [];
  state.rpcResponse = { data: { totals: {} }, error: null };
  delete process.env.DATA_DASH_FIXTURE_DIR;
});

describe('dataDashAuth tokens', () => {
  it('round-trips a valid token', () => {
    expect(tokenValid(issueToken())).toBe(true);
  });

  it('rejects expired tokens', () => {
    const expired = issueToken(Date.now() - 31 * 24 * 60 * 60 * 1000 - 1000);
    // issueToken(now) sets expiry 30 days after `now`, so this is in the past.
    expect(tokenValid(expired)).toBe(false);
  });

  it('rejects tampered tokens', () => {
    const [expires] = issueToken().split('.');
    expect(tokenValid(`${expires}.deadbeef`)).toBe(false);
    expect(tokenValid(`${Number(expires) + 9999}.${issueToken().split('.')[1]}`)).toBe(false);
  });

  it('matches only the exact password', () => {
    expect(passwordMatches('correct-horse-battery')).toBe(true);
    expect(passwordMatches('wrong')).toBe(false);
    expect(passwordMatches('')).toBe(false);
    expect(passwordMatches(null)).toBe(false);
  });

  it('sets httpOnly cookie attributes', () => {
    const cookie = sessionCookie(issueToken());
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
  });
});

describe('POST /api/data/login', () => {
  async function callLogin(body, headers = {}) {
    const { default: handler } = await import('../pages/api/data/login');
    const res = makeRes();
    await handler(
      {
        method: 'POST',
        headers: { origin: 'https://www.ielts-bank.com', 'x-real-ip': '203.0.113.9', ...headers },
        body,
        socket: { remoteAddress: '127.0.0.1' },
      },
      res
    );
    return res;
  }

  it('sets a session cookie on the right password', async () => {
    const res = await callLogin({ password: 'correct-horse-battery' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['Set-Cookie']).toContain(DATA_SESSION_COOKIE);
    expect(res.headers['X-Robots-Tag']).toContain('noindex');
  });

  it('rejects a wrong password without a cookie', async () => {
    const res = await callLogin({ password: 'nope' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['Set-Cookie']).toBeUndefined();
  });

  it('rate limits before checking the password', async () => {
    state.limitResponse = { data: false, error: null };
    const res = await callLogin({ password: 'correct-horse-battery' });
    expect(res.statusCode).toBe(429);
    expect(res.headers['Set-Cookie']).toBeUndefined();
  });
});

describe('GET /api/data/overview and /api/data/realtime', () => {
  async function callGet(route, cookie) {
    const { default: handler } =
      route === 'overview'
        ? await import('../pages/api/data/overview')
        : await import('../pages/api/data/realtime');
    const res = makeRes();
    await handler(
      { method: 'GET', headers: cookie ? { cookie } : {}, query: {} },
      res
    );
    return res;
  }

  it('returns 401 without a session cookie', async () => {
    expect((await callGet('overview')).statusCode).toBe(401);
    expect((await callGet('realtime')).statusCode).toBe(401);
  });

  it('returns 401 with a forged cookie', async () => {
    const forged = `${DATA_SESSION_COOKIE}=${Date.now() + 99999}.badsignature`;
    expect((await callGet('overview', forged)).statusCode).toBe(401);
  });

  it('serves data with a valid cookie and never caches', async () => {
    const res = await callGet('overview', authedCookieHeader());
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.data).toEqual({ totals: {} });
    expect(res.headers['Cache-Control']).toContain('no-store');
    const rpc = state.rpcCalls.find((call) => call.name === 'dashboard_overview');
    expect(rpc.args.p_bucket).toBe('day');
  });

  it('serves realtime with a valid cookie', async () => {
    const res = await callGet('realtime', authedCookieHeader());
    expect(res.statusCode).toBe(200);
    expect(state.rpcCalls.some((call) => call.name === 'dashboard_realtime')).toBe(true);
  });
});

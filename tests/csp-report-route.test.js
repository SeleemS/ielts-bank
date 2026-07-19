import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';

const state = {
  limitResponses: [],
  limitRejects: [],
  rpcCalls: [],
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async (name, args) => {
      state.rpcCalls.push({ name, args });
      const rejection = state.limitRejects.shift();
      if (rejection) throw rejection;
      return state.limitResponses.shift() || { data: true, error: null };
    },
  }),
}));

import handler from '../pages/api/csp-report';

function makeRes() {
  return {
    statusCode: null,
    headers: {},
    ended: false,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

async function callRoute({ method = 'POST', body = {}, headers = {} } = {}) {
  const res = makeRes();
  await handler(
    {
      method,
      body,
      headers: {
        'x-real-ip': '203.0.113.10',
        ...headers,
      },
      socket: { remoteAddress: '127.0.0.1' },
    },
    res
  );
  return res;
}

describe('POST /api/csp-report', () => {
  beforeEach(() => {
    state.limitResponses = [];
    state.limitRejects = [];
    state.rpcCalls = [];
    vi.restoreAllMocks();
  });

  it('allows only POST requests and advertises the supported method', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await callRoute({ method: 'GET' });

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
    expect(res.ended).toBe(true);
    expect(warning).not.toHaveBeenCalled();
    expect(state.rpcCalls).toEqual([]);
  });

  it('strips credentials, query strings, and fragments from legacy CSP URLs', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await callRoute({
      body: {
        'csp-report': {
          'blocked-uri': 'https://cdn.example/script.js?api_key=secret#fragment',
          'violated-directive': 'script-src-elem',
          'document-uri':
            'https://user:password@www.ielts-bank.com/auth/callback?code=oauth-secret#state',
          disposition: 'enforce',
          'original-policy': 'secret-policy-value',
        },
      },
    });

    expect(res.statusCode).toBe(204);
    expect(warning).toHaveBeenCalledWith('csp-violation', {
      blocked: 'https://cdn.example/script.js',
      directive: 'script-src-elem',
      document: 'https://www.ielts-bank.com/auth/callback',
      disposition: 'enforce',
    });
    expect(JSON.stringify(warning.mock.calls)).not.toContain('oauth-secret');
    expect(JSON.stringify(warning.mock.calls)).not.toContain('api_key');
    expect(JSON.stringify(warning.mock.calls)).not.toContain('password');
    expect(JSON.stringify(warning.mock.calls)).not.toContain('secret-policy-value');
    expect(state.rpcCalls).toEqual([
      {
        name: 'check_rate_limit',
        args: {
          p_bucket: 'csp-report-ip',
          p_identifier: '203.0.113.10',
          p_window_seconds: 60,
          p_max: 30,
        },
      },
      {
        name: 'check_rate_limit',
        args: {
          p_bucket: 'csp-report-global',
          p_identifier: 'all',
          p_window_seconds: 60,
          p_max: 300,
        },
      },
    ]);
  });

  it('accepts buffered Reporting API arrays and keeps non-URL schemes opaque', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const body = Buffer.from(
      JSON.stringify([
        {
          body: {
            blockedURL: 'data:text/javascript,secret-payload',
            effectiveDirective: 'script-src',
            documentURL: 'https://www.ielts-bank.com/pricing?offer=secret',
            disposition: 'report',
          },
        },
      ])
    );

    const res = await callRoute({ body });

    expect(res.statusCode).toBe(204);
    expect(warning).toHaveBeenCalledWith('csp-violation', {
      blocked: 'data:',
      directive: 'script-src',
      document: 'https://www.ielts-bank.com/pricing',
      disposition: 'report',
    });
    expect(JSON.stringify(warning.mock.calls)).not.toContain('secret-payload');
    expect(JSON.stringify(warning.mock.calls)).not.toContain('offer=secret');
  });

  it('acknowledges malformed JSON without a limiter call or log entry', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await callRoute({ body: '{not-json' });

    expect(res.statusCode).toBe(204);
    expect(warning).not.toHaveBeenCalled();
    expect(state.rpcCalls).toEqual([]);
  });

  it('removes control characters and preserves strict field limits', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const longPath = `https://www.ielts-bank.com/${'a'.repeat(600)}?token=secret`;

    const res = await callRoute({
      body: {
        blockedURL: longPath,
        effectiveDirective: `script\u0000src ${'d'.repeat(150)}`,
        documentURL: '/auth/callback?code=secret#fragment',
        disposition: `enforce\n${'x'.repeat(60)}`,
      },
    });

    expect(res.statusCode).toBe(204);
    const safe = warning.mock.calls[0][1];
    expect(safe.blocked).toHaveLength(500);
    expect(safe.blocked).not.toContain('?');
    expect(safe.directive).toHaveLength(120);
    expect(safe.directive).not.toContain('\u0000');
    expect(safe.document).toBe('/auth/callback');
    expect(safe.disposition).toHaveLength(40);
    expect(safe.disposition).not.toContain('\n');
  });

  it('silently drops reports after a verified per-IP limiter denial', async () => {
    state.limitResponses = [{ data: false, error: null }];
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await callRoute({
      body: { 'csp-report': { 'document-uri': 'https://www.ielts-bank.com/' } },
    });

    expect(res.statusCode).toBe(204);
    expect(warning).not.toHaveBeenCalled();
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0].args.p_bucket).toBe('csp-report-ip');
  });

  it('silently drops reports after a verified global limiter denial', async () => {
    state.limitResponses = [
      { data: true, error: null },
      { data: false, error: null },
    ];
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await callRoute({
      body: { 'csp-report': { 'document-uri': 'https://www.ielts-bank.com/' } },
    });

    expect(res.statusCode).toBe(204);
    expect(warning).not.toHaveBeenCalled();
    expect(state.rpcCalls.map(({ args }) => args.p_bucket)).toEqual([
      'csp-report-ip',
      'csp-report-global',
    ]);
  });

  it('fails closed without logging a report when the limiter resolves with an error', async () => {
    state.limitResponses = [
      { data: null, error: { message: 'database unavailable' } },
    ];
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callRoute({
      body: { 'csp-report': { 'document-uri': 'https://www.ielts-bank.com/' } },
    });

    expect(res.statusCode).toBe(204);
    expect(warning).not.toHaveBeenCalled();
    expect(state.rpcCalls).toHaveLength(1);
  });

  it('fails closed without logging a report when the limiter rejects', async () => {
    state.limitRejects = [new Error('network unavailable')];
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callRoute({
      body: { 'csp-report': { 'document-uri': 'https://www.ielts-bank.com/' } },
    });

    expect(res.statusCode).toBe(204);
    expect(warning).not.toHaveBeenCalled();
    expect(state.rpcCalls).toHaveLength(1);
  });

  it('throttles limiter infrastructure diagnostics to one per minute', async () => {
    const failure = { data: null, error: { message: 'database unavailable' } };
    state.limitResponses = [failure, failure, failure];
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const base = Date.now() + 120_000;
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(base)
      .mockReturnValueOnce(base + 59_999)
      .mockReturnValueOnce(base + 60_000);
    const request = {
      body: { 'csp-report': { 'document-uri': 'https://www.ielts-bank.com/' } },
    };

    const first = await callRoute(request);
    const second = await callRoute(request);
    const third = await callRoute(request);

    expect([first.statusCode, second.statusCode, third.statusCode]).toEqual([
      204, 204, 204,
    ]);
    expect(error).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenNthCalledWith(
      1,
      'csp-report rate-limit check failed:',
      'database unavailable'
    );
    expect(error).toHaveBeenNthCalledWith(
      2,
      'csp-report rate-limit check failed:',
      'database unavailable'
    );
    expect(warning).not.toHaveBeenCalled();
    expect(state.rpcCalls).toHaveLength(3);
  });
});

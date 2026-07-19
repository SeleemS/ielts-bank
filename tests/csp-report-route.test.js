import { beforeEach, describe, expect, it, vi } from 'vitest';
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

function callRoute({ method = 'POST', body = {} } = {}) {
  const res = makeRes();
  handler({ method, body }, res);
  return res;
}

describe('POST /api/csp-report', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('allows only POST requests and advertises the supported method', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = callRoute({ method: 'GET' });

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
    expect(res.ended).toBe(true);
    expect(warning).not.toHaveBeenCalled();
  });

  it('strips credentials, query strings, and fragments from legacy CSP URLs', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = callRoute({
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
  });

  it('accepts buffered Reporting API arrays and keeps non-URL schemes opaque', () => {
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

    const res = callRoute({ body });

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

  it('treats malformed JSON as an empty report without throwing', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = callRoute({ body: '{not-json' });

    expect(res.statusCode).toBe(204);
    expect(warning).toHaveBeenCalledWith('csp-violation', {
      blocked: '',
      directive: '',
      document: '',
      disposition: '',
    });
  });

  it('removes control characters and preserves strict field limits', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const longPath = `https://www.ielts-bank.com/${'a'.repeat(600)}?token=secret`;

    const res = callRoute({
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
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getServerSideProps } from '../pages/go/[program].js';

const KEYS = ['AFFILIATE_URL_PREPLY', 'AFFILIATE_URL_WISE', 'AFFILIATE_URL_LEVERAGE_EDU'];
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

function context(program, query = {}) {
  const headers = {};
  return {
    params: { program },
    query: { program, ...query },
    res: { setHeader: (name, value) => { headers[name.toLowerCase()] = value; } },
    headers,
  };
}

beforeEach(() => {
  for (const key of KEYS) delete process.env[key];
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
});

describe('/go/[program] affiliate redirect', () => {
  it('302s to the configured URL and marks the response noindex', async () => {
    process.env.AFFILIATE_URL_PREPLY = 'https://preply.com/en/?pref=abc';
    const ctx = context('preply', { placement: 'writing_result' });
    const result = await getServerSideProps(ctx);
    expect(result).toEqual({
      redirect: { destination: 'https://preply.com/en/?pref=abc', statusCode: 302 },
    });
    expect(ctx.headers['x-robots-tag']).toMatch(/noindex/);
    expect(ctx.headers['cache-control']).toMatch(/no-store/);
    expect(console.info).toHaveBeenCalledWith(
      'affiliate_redirect',
      JSON.stringify({ program: 'preply', placement: 'writing_result' })
    );
  });

  it('404s for an unknown program', async () => {
    process.env.AFFILIATE_URL_PREPLY = 'https://preply.com/en/?pref=abc';
    const ctx = context('evil-corp');
    expect(await getServerSideProps(ctx)).toEqual({ notFound: true });
    expect(ctx.headers['x-robots-tag']).toMatch(/noindex/);
  });

  it('404s for a registered program with no URL configured (inert by default)', async () => {
    expect(await getServerSideProps(context('wise'))).toEqual({ notFound: true });
    expect(await getServerSideProps(context('leverage-edu'))).toEqual({ notFound: true });
  });

  it('404s rather than redirecting to a non-https URL', async () => {
    process.env.AFFILIATE_URL_WISE = 'http://wise.com/invite/x';
    expect(await getServerSideProps(context('wise'))).toEqual({ notFound: true });
  });

  it('does not echo an arbitrary placement string into logs', async () => {
    process.env.AFFILIATE_URL_WISE = 'https://wise.com/invite/x';
    await getServerSideProps(context('wise', { placement: '<script>alert(1)</script>' }));
    expect(console.info).toHaveBeenCalledWith(
      'affiliate_redirect',
      JSON.stringify({ program: 'wise', placement: null })
    );
  });
});

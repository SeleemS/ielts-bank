import { beforeEach, describe, expect, it, vi } from 'vitest';

const nextResponse = vi.hoisted(() => ({
  next: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: nextResponse,
}));

import { middleware } from './middleware';

function request({ country, cookie } = {}) {
  return {
    headers: {
      get: vi.fn(() => country ?? null),
    },
    cookies: {
      get: vi.fn(() => (cookie ? { value: cookie } : undefined)),
    },
  };
}

describe('geo-aware consent middleware', () => {
  beforeEach(() => {
    nextResponse.next.mockReset();
    nextResponse.next.mockImplementation(() => ({
      cookies: { set: vi.fn() },
    }));
  });

  it.each(['DE', 'GB', 'NO', 'CH'])(
    'sets denied for consent-required country %s',
    (country) => {
      const response = middleware(request({ country }));

      expect(response.cookies.set).toHaveBeenCalledWith(
        'ib_consent_default',
        'denied',
        expect.objectContaining({ path: '/', sameSite: 'lax' })
      );
    }
  );

  it('sets granted for a known non-required country', () => {
    const response = middleware(request({ country: 'CA' }));

    expect(response.cookies.set).toHaveBeenCalledWith(
      'ib_consent_default',
      'granted',
      expect.objectContaining({ path: '/', sameSite: 'lax' })
    );
  });

  it.each([undefined, '', 'unknown'])(
    'fails closed when geo is unavailable or malformed (%s)',
    (country) => {
      const response = middleware(request({ country }));

      expect(response.cookies.set).toHaveBeenCalledWith(
        'ib_consent_default',
        'denied',
        expect.any(Object)
      );
    }
  );

  it('does not rewrite an unchanged consent-default cookie', () => {
    const response = middleware(request({ country: 'CH', cookie: 'denied' }));

    expect(nextResponse.next).toHaveBeenCalledTimes(1);
    expect(response.cookies.set).not.toHaveBeenCalled();
  });
});

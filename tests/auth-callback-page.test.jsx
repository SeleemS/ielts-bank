// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const testState = vi.hoisted(() => ({
  getSession: vi.fn(),
  router: {
    asPath: '/auth/callback',
    isReady: false,
    replace: vi.fn(),
  },
}));

vi.mock('next/head', () => ({
  default: ({ children }) => React.createElement(React.Fragment, null, children),
}));
vi.mock('next/router', () => ({
  useRouter: () => testState.router,
}));
vi.mock('../src/components/auth/SignInDialog', () => ({
  default: ({ open, initialMode }) => open
    ? <div role="dialog" data-mode={initialMode}>Sign-in form</div>
    : null,
}));
vi.mock('../lib/supabase', () => ({
  getSupabase: () => ({
    auth: { getSession: testState.getSession },
  }),
}));

import AuthCallback from '../pages/auth/callback';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

beforeEach(() => {
  testState.router.isReady = false;
  testState.router.asPath = "/auth/callback";
  window.history.replaceState({}, "", "/auth/callback");
  testState.getSession.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('Auth callback metadata', () => {
  it('keeps the transient credential-processing route out of search indexes', () => {
    act(() => {
      root.render(<AuthCallback />);
    });

    expect(container.querySelector('title')?.textContent).toBe(
      'Completing sign in | IELTS-Bank'
    );
    expect(container.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, nofollow'
    );
  });

  it('reaches the dashboard when the delayed session retry succeeds', async () => {
    vi.useFakeTimers();
    testState.router.isReady = true;
    testState.getSession
      .mockResolvedValueOnce({ data: { session: null }, error: null })
      .mockResolvedValueOnce({
        data: { session: { user: { id: 'user-1' } } },
        error: null,
      });

    await act(async () => {
      root.render(<AuthCallback />);
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(testState.getSession).toHaveBeenCalledTimes(2);
    expect(testState.router.replace).toHaveBeenCalledWith('/dashboard');
  });

  it('recovers when the delayed session retry rejects', async () => {
    vi.useFakeTimers();
    testState.router.isReady = true;
    testState.getSession
      .mockResolvedValueOnce({ data: { session: null }, error: null })
      .mockRejectedValueOnce(new Error('auth storage unavailable'));

    await act(async () => {
      root.render(<AuthCallback />);
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(testState.getSession).toHaveBeenCalledTimes(2);
    expect(testState.router.replace).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('We couldn’t complete this sign-in link');
  });
});


describe('Callback failure recovery', () => {
  it.each([
    '/auth/callback#error=access_denied&error_code=otp_expired&error_description=private-provider-detail',
    '/auth/callback?error=access_denied&error_code=otp_expired',
  ])('keeps explicit link errors visible even with an existing session: %s', async (path) => {
    testState.router.isReady = true;
    testState.router.asPath = path;
    testState.getSession.mockResolvedValue({ data: { session: { user: { id: 'other' } } } });
    await act(async () => { root.render(<AuthCallback />); await Promise.resolve(); });
    expect(testState.getSession).not.toHaveBeenCalled();
    expect(testState.router.replace).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('fresh code');
    expect(container.textContent).not.toContain('private-provider-detail');
    await act(async () => { container.querySelector('button').click(); });
    expect(container.querySelector('[role="dialog"]')?.getAttribute('data-mode')).toBe('signin');
  });

  it('recognizes a browser fragment before router readiness', async () => {
    window.history.replaceState({}, '', '/auth/callback#error_code=otp_expired');
    await act(async () => { root.render(<AuthCallback />); });
    // SDK consumes the fragment before Next finishes initializing.
    window.history.replaceState({}, '', '/auth/callback');
    testState.router.isReady = true;
    await act(async () => { root.render(<AuthCallback />); await Promise.resolve(); });
    expect(testState.getSession).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('keeps a missing-session failure on page with reset guidance', async () => {
    vi.useFakeTimers();
    testState.router.isReady = true;
    testState.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await act(async () => { root.render(<AuthCallback />); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(testState.router.replace).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Forgot password?');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/');
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('does not treat a retry containing an error and stale session as success', async () => {
    vi.useFakeTimers();
    testState.router.isReady = true;
    testState.getSession.mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce({ data: { session: { user: { id: 'stale' } } }, error: new Error('invalid session') });
    await act(async () => { root.render(<AuthCallback />); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(testState.router.replace).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('still redirects a valid immediate session to dashboard', async () => {
    testState.router.isReady = true;
    testState.getSession.mockResolvedValue({ data: { session: { user: { id: 'valid' } } }, error: null });
    await act(async () => { root.render(<AuthCallback />); await Promise.resolve(); });
    expect(testState.router.replace).toHaveBeenCalledWith('/dashboard');
  });
});

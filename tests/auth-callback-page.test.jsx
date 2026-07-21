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
    expect(testState.router.replace).toHaveBeenCalledWith('/');
    expect(container.textContent).toContain('Could not sign you in. Redirecting');
  });
});

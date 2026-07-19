// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

vi.mock('next/head', () => ({
  default: ({ children }) => React.createElement(React.Fragment, null, children),
}));
vi.mock('next/router', () => ({
  useRouter: () => ({
    asPath: '/auth/callback',
    isReady: false,
    replace: vi.fn(),
  }),
}));
vi.mock('../lib/supabase', () => ({
  getSupabase: vi.fn(),
}));

import AuthCallback from '../pages/auth/callback';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
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
});

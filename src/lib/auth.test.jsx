// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const testState = vi.hoisted(() => ({
  signOut: vi.fn(),
  signInWithOtp: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({
        data: {
          session: {
            user: { id: 'user-1', email: 'audit@example.com' },
            access_token: 'access-token',
          },
        },
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithOtp: testState.signInWithOtp,
      signOut: testState.signOut,
    },
  }),
}));
vi.mock('./analytics', () => ({
  setAnalyticsUser: vi.fn(),
  track: vi.fn(),
}));

import { AuthProvider, useAuth } from './auth';
import { setAnalyticsUser } from './analytics';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
let currentAuth;

function Harness() {
  const auth = useAuth();
  currentAuth = auth;
  const { user, loading, signOut } = auth;
  const [message, setMessage] = React.useState('');
  return (
    <>
      <p>{loading ? 'loading' : user?.email || 'signed out'}</p>
      <button
        type="button"
        onClick={async () => {
          const { error } = await signOut();
          setMessage(error?.message || 'success');
        }}
      >
        Sign out
      </button>
      <output>{message}</output>
    </>
  );
}

async function renderProvider() {
  await act(async () => {
    root.render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function clickSignOut() {
  await act(async () => {
    container
      .querySelector('button')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  currentAuth = null;
  testState.signInWithOtp.mockResolvedValue({ error: null });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('AuthProvider sign out', () => {
  it('returns a rejected network request as an error without losing local session state', async () => {
    testState.signOut.mockRejectedValue(new Error('network unavailable'));
    await renderProvider();

    await clickSignOut();

    expect(container.textContent).toContain('audit@example.com');
    expect(container.querySelector('output')?.textContent).toBe(
      'network unavailable'
    );
  });

  it('clears user and analytics identity after a successful sign out', async () => {
    testState.signOut.mockResolvedValue({ error: null });
    await renderProvider();

    await clickSignOut();

    expect(container.textContent).toContain('signed out');
    expect(container.querySelector('output')?.textContent).toBe('success');
    expect(setAnalyticsUser).toHaveBeenLastCalledWith(null, null);
  });

  it('does not create a new account from the existing-user email-code path', async () => {
    await renderProvider();

    await act(async () => {
      await currentAuth.signInWithEmail('existing@example.com');
    });

    expect(testState.signInWithOtp).toHaveBeenCalledWith({
      email: 'existing@example.com',
      options: {
        emailRedirectTo: expect.stringMatching(/\/auth\/callback$/),
        shouldCreateUser: false,
      },
    });
  });
});

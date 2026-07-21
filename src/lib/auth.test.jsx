// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const testState = vi.hoisted(() => ({
  signOut: vi.fn(),
  signInWithOtp: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  verifyOtp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  resend: vi.fn(),
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
      signUp: testState.signUp,
      signInWithPassword: testState.signInWithPassword,
      verifyOtp: testState.verifyOtp,
      resetPasswordForEmail: testState.resetPasswordForEmail,
      updateUser: testState.updateUser,
      resend: testState.resend,
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
  testState.signUp.mockResolvedValue({ data: { user: null, session: null }, error: null });
  testState.signInWithPassword.mockResolvedValue({ error: null });
  testState.verifyOtp.mockResolvedValue({ error: null });
  testState.resetPasswordForEmail.mockResolvedValue({ error: null });
  testState.updateUser.mockResolvedValue({ error: null });
  testState.resend.mockResolvedValue({ error: null });
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
    expect(testState.signOut).toHaveBeenCalledWith({ scope: 'local' });
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

describe('AuthProvider rejected-call recovery', () => {
  it('preserves the resolved error contract across every exposed auth journey', async () => {
    const networkError = new Error('network unavailable');
    await renderProvider();

    const cases = [
      [testState.signInWithOtp, () => currentAuth.signInWithEmail('audit@example.com')],
      [testState.signUp, () => currentAuth.signUpWithPassword('audit@example.com', 'password123')],
      [testState.signInWithPassword, () => currentAuth.signInWithPassword('audit@example.com', 'password123')],
      [testState.verifyOtp, () => currentAuth.verifyEmailOtp('audit@example.com', '123456')],
      [testState.resend, () => currentAuth.resendSignupEmail('audit@example.com')],
      [testState.resetPasswordForEmail, () => currentAuth.requestPasswordReset('audit@example.com')],
      [testState.updateUser, () => currentAuth.updatePassword('password123')],
    ];

    for (const [providerCall, invoke] of cases) {
      providerCall.mockRejectedValueOnce(networkError);
      let result;
      await act(async () => {
        result = await invoke();
      });
      expect(result.error).toBe(networkError);
    }

    testState.signInWithPassword.mockRejectedValueOnce('offline');
    const fallback = await currentAuth.signInWithPassword(
      'audit@example.com',
      'password123'
    );
    expect(fallback.error).toEqual(
      new Error('Could not sign you in. Please try again.')
    );
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const testState = vi.hoisted(() => ({
  sessionUser: null,
  signOut: vi.fn(),
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
            user: testState.sessionUser,
            access_token: 'access-token',
          },
        },
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
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
  testState.sessionUser = { id: 'user-1', email: 'audit@example.com' };
  currentAuth = null;
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
});

describe('AuthProvider rejected-call recovery', () => {
  it('preserves the resolved error contract across every exposed auth journey', async () => {
    const networkError = new Error('network unavailable');
    await renderProvider();

    const cases = [
      [testState.signUp, () => currentAuth.signUpWithPassword('audit@example.com', 'password123')],
      [testState.signInWithPassword, () => currentAuth.signInWithPassword('audit@example.com', 'password123')],
      [testState.verifyOtp, () => currentAuth.verifyEmailOtp('audit@example.com', '123456')],
      [testState.resend, () => currentAuth.resendSignupEmail('audit@example.com')],
      [testState.resetPasswordForEmail, () => currentAuth.requestPasswordReset('audit@example.com')],
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

describe('password recovery identity binding', () => {
  async function verifyRecovery(email = 'audit@example.com') {
    testState.verifyOtp.mockResolvedValueOnce({
      error: null,
      data: { user: { id: 'user-1', email }, session: { access_token: 'verified-recovery-token' } },
    });
    return currentAuth.verifyEmailOtp(email, '123456', 'recovery');
  }
  afterEach(() => vi.unstubAllGlobals());
  it('cannot update a password from an ordinary signed-in session', async () => {
    await renderProvider();
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const result = await currentAuth.updatePassword('new-password123', 'audit@example.com');
    expect(result.error.message).toContain('Verify a password reset code');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('uses the verified recovery token and consumes it after a successful update', async () => {
    await renderProvider();
    expect((await verifyRecovery()).error).toBeNull();
    const fetchMock = vi.fn().mockResolvedValue({ok:true,json:async()=>({id:'user-1'})});
    vi.stubGlobal('fetch',fetchMock);
    expect((await currentAuth.updatePassword('new-password123','audit@example.com')).error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/auth/v1/user'),expect.objectContaining({
      method:'PUT',headers:expect.objectContaining({Authorization:'Bearer verified-recovery-token'}),
      body:JSON.stringify({password:'new-password123'}),
    }));
    expect((await currentAuth.updatePassword('another-password123','audit@example.com')).error).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('rejects a session switch to another account before password submission', async () => {
    await renderProvider(); await verifyRecovery();
    testState.sessionUser = {id:'other-user',email:'other@example.com'};
    const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
    const result=await currentAuth.updatePassword('new-password123','audit@example.com');
    expect(result.error.message).toContain('account changed');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects a mismatched target email and preserves retry on a network failure', async () => {
    await renderProvider();await verifyRecovery();
    const fetchMock=vi.fn().mockRejectedValue(new Error('Network unavailable'));vi.stubGlobal('fetch',fetchMock);
    expect((await currentAuth.updatePassword('new-password123','other@example.com')).error).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await currentAuth.updatePassword('new-password123','audit@example.com')).error.message).toBe('Network unavailable');
    fetchMock.mockResolvedValue({ok:true,json:async()=>({id:'user-1'})});
    expect((await currentAuth.updatePassword('new-password123','audit@example.com')).error).toBeNull();
  });
});

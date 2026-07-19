// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const testState = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/router', () => ({
  useRouter: () => ({
    asPath: '/',
    replace: testState.replace,
  }),
}));
vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    user: null,
    signInWithEmail: vi.fn(),
    signUpWithPassword: testState.signUpWithPassword,
    signInWithPassword: testState.signInWithPassword,
    verifyEmailOtp: vi.fn(),
    resendSignupEmail: vi.fn(),
    requestPasswordReset: vi.fn(),
    updatePassword: vi.fn(),
  }),
}));
vi.mock('../../../lib/supabase', () => ({
  getSupabase: vi.fn(),
}));
vi.mock('../../lib/analytics', () => ({
  track: vi.fn(),
}));
vi.mock('../../lib/fonts', () => ({
  inter: { variable: '' },
}));

import SignInDialog from './SignInDialog';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

function setInput(id, value) {
  const input = document.querySelector(id);
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function renderDialog(initialMode) {
  await act(async () => {
    root.render(
      <SignInDialog
        open
        onOpenChange={vi.fn()}
        initialMode={initialMode}
      />
    );
    await Promise.resolve();
  });
}

beforeEach(() => {
  testState.signInWithPassword.mockResolvedValue({ error: null });
  testState.signUpWithPassword.mockResolvedValue({
    data: { user: { identities: [{}] }, session: null },
    error: null,
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('SignInDialog password validation', () => {
  it('lets the authentication service evaluate an existing six-character password', async () => {
    await renderDialog('signin');
    setInput('#signin-email', 'legacy-user@example.com');
    setInput('#signin-password', '123456');

    const password = document.querySelector('#signin-password');
    const submit = document.querySelector('[role="dialog"] button[type="submit"]');
    expect(password.getAttribute('minlength')).toBeNull();
    expect(submit.disabled).toBe(false);

    await act(async () => {
      submit.closest('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );
      await Promise.resolve();
    });

    expect(testState.signInWithPassword).toHaveBeenCalledWith(
      'legacy-user@example.com',
      '123456'
    );
  });

  it('keeps the eight-character client minimum for new accounts', async () => {
    await renderDialog('signup');
    setInput('#signin-email', 'new-user@example.com');
    setInput('#signin-password', '123456');

    const password = document.querySelector('#signin-password');
    const submit = document.querySelector('[role="dialog"] button[type="submit"]');
    expect(password.getAttribute('minlength')).toBe('8');
    expect(submit.disabled).toBe(true);

    setInput('#signin-password', '12345678');
    expect(submit.disabled).toBe(false);
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const testState = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  resendSignupEmail: vi.fn(),
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
    resendSignupEmail: testState.resendSignupEmail,
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

import SignInDialog, { emailSendCooldownSeconds, isEmailSendCapError } from './SignInDialog';

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
  testState.resendSignupEmail.mockResolvedValue({ error: null });
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
  vi.useRealTimers();
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
    setInput('#signup-first-name', 'new');
    setInput('#signup-last-name', 'user');
    setInput('#signin-email', 'new-user@example.com');
    setInput('#signin-password', '123456');

    const password = document.querySelector('#signin-password');
    const submit = document.querySelector('[role="dialog"] button[type="submit"]');
    expect(password.getAttribute('minlength')).toBe('8');
    expect(submit.disabled).toBe(true);

    setInput('#signin-password', '12345678');
    expect(submit.disabled).toBe(false);
  });

  it('requires first and last name for new accounts and title-cases them', async () => {
    await renderDialog('signup');
    setInput('#signin-email', 'new-user@example.com');
    setInput('#signin-password', '12345678');

    const submit = document.querySelector('[role="dialog"] button[type="submit"]');
    expect(submit.disabled).toBe(true);

    setInput('#signup-first-name', 'seleem');
    expect(submit.disabled).toBe(true);
    setInput('#signup-last-name', 'shaalan');
    expect(submit.disabled).toBe(false);

    testState.signUpWithPassword.mockResolvedValue({ data: { user: { identities: [{}] } }, error: null });
    await act(async () => {
      submit.closest('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );
      await Promise.resolve();
    });

    expect(testState.signUpWithPassword).toHaveBeenCalledWith(
      'new-user@example.com',
      '12345678',
      { full_name: 'Seleem Shaalan', first_name: 'Seleem', last_name: 'Shaalan' }
    );
  });

  it('does not claim a confirmation code was sent when automatic resend fails', async () => {
    testState.signInWithPassword.mockResolvedValue({
      error: Object.assign(new Error('Confirm your email before signing in'), {
        code: 'email_not_confirmed',
      }),
    });
    testState.resendSignupEmail.mockResolvedValue({
      error: new Error('Email service unavailable'),
    });
    await renderDialog('signin');
    setInput('#signin-email', 'unconfirmed@example.com');
    setInput('#signin-password', 'password123');

    const submit = document.querySelector('[role="dialog"] button[type="submit"]');
    await act(async () => {
      submit.closest('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(testState.resendSignupEmail).toHaveBeenCalledWith(
      'unconfirmed@example.com'
    );
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Email service unavailable'
    );
    expect(document.querySelector('#signin-password')).not.toBeNull();
    expect(document.querySelector('#signin-otp')).toBeNull();
  });

  it('uses the stable invalid-credentials code instead of exposing provider text', async () => {
    testState.signInWithPassword.mockResolvedValue({
      error: Object.assign(new Error('Authentication failed for supplied login'), {
        code: 'invalid_credentials',
      }),
    });
    await renderDialog('signin');
    setInput('#signin-email', 'learner@example.com');
    setInput('#signin-password', 'password123');

    const submit = document.querySelector('[role="dialog"] button[type="submit"]');
    await act(async () => {
      submit.closest('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      'Email or password is incorrect. If you signed up before we added passwords, use the emailed code option below.'
    );
  });

  it('allows an immediate retry when a manual resend fails', async () => {
    vi.useFakeTimers();
    await renderDialog('signup');
    setInput('#signup-first-name', 'New');
    setInput('#signup-last-name', 'User');
    setInput('#signin-email', 'new-user@example.com');
    setInput('#signin-password', 'password123');

    const submit = document.querySelector('[role="dialog"] button[type="submit"]');
    await act(async () => {
      submit.closest('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    for (let second = 0; second < 30; second += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
    }

    testState.resendSignupEmail.mockResolvedValue({
      error: new Error('Temporary email outage'),
    });
    const resend = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Resend code'
    );
    await act(async () => {
      resend.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Temporary email outage'
    );
    expect(resend.disabled).toBe(false);
    expect(resend.textContent).toBe('Resend code');
  });
});

function rateLimitError(seconds = 47) {
  return Object.assign(
    new Error(`For security purposes, you can only request this after ${seconds} seconds.`),
    { code: 'over_email_send_rate_limit', status: 429 }
  );
}

async function submitAccountForm() {
  const submit = document.querySelector('[role="dialog"] button[type="submit"]');
  await act(async () => {
    submit.closest('form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('SignInDialog email send rate limit', () => {
  it('parses the provider cooldown and ignores unrelated errors', () => {
    expect(emailSendCooldownSeconds(rateLimitError(47))).toBe(47);
    expect(emailSendCooldownSeconds(new Error('Email service unavailable'))).toBeNull();
    expect(emailSendCooldownSeconds(null)).toBeNull();
    // The project-wide cap shares the code but sends nothing.
    const cap = Object.assign(new Error('Email rate limit exceeded'), {
      code: 'over_email_send_rate_limit',
    });
    expect(emailSendCooldownSeconds(cap)).toBeNull();
    expect(isEmailSendCapError(cap)).toBe(true);
    expect(isEmailSendCapError(rateLimitError(47))).toBe(false);
    expect(isEmailSendCapError(new Error('Email service unavailable'))).toBe(false);
  });

  it('reports an exhausted hourly email cap honestly instead of claiming a code was sent', async () => {
    testState.signUpWithPassword.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Email rate limit exceeded'), {
        code: 'over_email_send_rate_limit',
      }),
    });
    await renderDialog('signup');
    setInput('#signup-first-name', 'New');
    setInput('#signup-last-name', 'User');
    setInput('#signin-email', 'learner@example.com');
    setInput('#signin-password', 'password123');

    await submitAccountForm();

    expect(document.querySelector('#signin-otp')).toBeNull();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('no code was sent');
  });

  it('continues to verification when a repeated signup hits the send window', async () => {
    testState.signUpWithPassword.mockResolvedValue({ data: null, error: rateLimitError(47) });
    await renderDialog('signup');
    setInput('#signup-first-name', 'Misheel');
    setInput('#signup-last-name', 'Kh');
    setInput('#signin-email', 'learner@example.com');
    setInput('#signin-password', 'password123');

    await submitAccountForm();

    expect(document.querySelector('#signin-otp')).not.toBeNull();
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelector('[role="status"]')?.textContent).toContain('spam or junk');
    const resend = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent.startsWith('Resend code')
    );
    expect(resend.disabled).toBe(true);
    expect(resend.textContent).toBe('Resend code in 47s');
  });

  it('continues to verification when the unconfirmed sign-in resend hits the send window', async () => {
    testState.signInWithPassword.mockResolvedValue({
      error: Object.assign(new Error('Email not confirmed'), { code: 'email_not_confirmed' }),
    });
    testState.resendSignupEmail.mockResolvedValue({ error: rateLimitError(12) });
    await renderDialog('signin');
    setInput('#signin-email', 'unconfirmed@example.com');
    setInput('#signin-password', 'password123');

    await submitAccountForm();

    expect(document.querySelector('#signin-otp')).not.toBeNull();
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelector('[role="status"]')?.textContent).toContain('already emailed');
    const resend = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent.startsWith('Resend code')
    );
    expect(resend.textContent).toBe('Resend code in 12s');
  });

  it('keeps the provider countdown when a manual resend hits the send window', async () => {
    vi.useFakeTimers();
    await renderDialog('signup');
    setInput('#signup-first-name', 'New');
    setInput('#signup-last-name', 'User');
    setInput('#signin-email', 'new-user@example.com');
    setInput('#signin-password', 'password123');
    await submitAccountForm();
    for (let second = 0; second < 30; second += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
    }

    testState.resendSignupEmail.mockResolvedValue({ error: rateLimitError(20) });
    const resend = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Resend code'
    );
    await act(async () => {
      resend.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelector('[role="status"]')?.textContent).toContain('already emailed');
    expect(resend.disabled).toBe(true);
    expect(resend.textContent).toBe('Resend code in 20s');
  });

  it('lets the learner go back and correct a mistyped address', async () => {
    await renderDialog('signup');
    setInput('#signup-first-name', 'New');
    setInput('#signup-last-name', 'User');
    setInput('#signin-email', 'typo@example.con');
    setInput('#signin-password', 'password123');
    await submitAccountForm();
    expect(document.querySelector('#signin-otp')).not.toBeNull();
    expect(document.querySelector('[role="dialog"]').textContent).toContain('spam or junk');

    const back = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Use a different email')
    );
    await act(async () => {
      back.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.querySelector('#signin-otp')).toBeNull();
    expect(document.querySelector('#signin-email')?.value).toBe('typo@example.con');
  });
});

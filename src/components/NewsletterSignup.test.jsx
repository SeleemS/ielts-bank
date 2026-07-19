// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const testState = vi.hoisted(() => ({
  user: null,
}));

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ user: testState.user }),
}));
vi.mock('../lib/analytics', () => ({
  track: vi.fn(),
}));
vi.mock('../../components/ui/button', () => ({
  Button: ({ children, ...props }) => React.createElement('button', props, children),
}));
vi.mock('../../components/ui/input', () => ({
  Input: (props) => React.createElement('input', props),
}));

import NewsletterSignup from './NewsletterSignup';
import { track } from '../lib/analytics';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

function renderSignup(props = {}) {
  act(() => {
    root.render(<NewsletterSignup source="audit-widget" {...props} />);
  });
}

function enterEmail(value = 'audit@example.com') {
  const input = container.querySelector('input[type="email"]');
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submitSignup() {
  await act(async () => {
    container
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  testState.user = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  global.fetch = vi.fn();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete global.fetch;
  vi.clearAllMocks();
});

describe('NewsletterSignup analytics', () => {
  it('records successful signed-in subscriptions accurately', async () => {
    testState.user = { id: 'user-123' };
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    renderSignup();
    enterEmail();

    await submitSignup();

    expect(container.textContent).toContain("You're in — check your inbox");
    expect(track).toHaveBeenCalledWith('newsletter_subscribe', {
      source: 'audit-widget',
      outcome: 'success',
      signed_in: true,
      status: 200,
    });
  });

  it('records API rejections without including the email address', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Too many sign-up attempts.' }),
    });
    renderSignup({ variant: 'compact' });
    enterEmail();

    await submitSignup();

    expect(container.textContent).toContain('Too many sign-up attempts.');
    expect(track).toHaveBeenCalledWith('newsletter_subscribe', {
      source: 'audit-widget',
      outcome: 'error',
      signed_in: false,
      status: 429,
    });
    expect(JSON.stringify(track.mock.calls)).not.toContain('audit@example.com');
  });

  it('records a network failure separately', async () => {
    global.fetch.mockRejectedValue(new Error('offline'));
    renderSignup();
    enterEmail();

    await submitSignup();

    expect(container.textContent).toContain('A network error occurred');
    expect(track).toHaveBeenCalledWith('newsletter_subscribe', {
      source: 'audit-widget',
      outcome: 'network_error',
      signed_in: false,
      status: 0,
    });
  });
});

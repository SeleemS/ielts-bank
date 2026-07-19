// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const testState = vi.hoisted(() => ({
  user: null,
}));

vi.mock('next/head', () => ({
  default: ({ children }) => React.createElement(React.Fragment, null, children),
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) =>
    React.createElement('a', { href, ...rest }, children),
}));
vi.mock('../components/Navbar', () => ({ default: () => null }));
vi.mock('../components/Footer', () => ({ default: () => null }));
vi.mock('../lib/auth', () => ({
  useAuth: () => ({ user: testState.user }),
}));
vi.mock('../lib/analytics', () => ({
  track: vi.fn(),
}));
vi.mock('../../components/ui/button', () => ({
  Button: ({ children, asChild, ...props }) =>
    asChild
      ? React.createElement(React.Fragment, null, children)
      : React.createElement('button', props, children),
}));
vi.mock('../../components/ui/card', () => ({
  Card: ({ children }) => React.createElement('div', null, children),
  CardContent: ({ children }) => React.createElement('div', null, children),
  CardDescription: ({ children }) => React.createElement('div', null, children),
  CardHeader: ({ children }) => React.createElement('div', null, children),
  CardTitle: ({ children, as = 'h3' }) => React.createElement(as, null, children),
}));

import ContactUs from './ContactUs';
import { track } from '../lib/analytics';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

function renderContact() {
  act(() => {
    root.render(<ContactUs />);
  });
}

function fillContactForm() {
  container.querySelector('#name').value = 'Audit User';
  container.querySelector('#email').value = 'audit@example.com';
  container.querySelector('#message').value = 'Test contact message';
}

async function submitContactForm() {
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

describe('ContactUs submission analytics', () => {
  it('uses a second-level heading for the contact form section', () => {
    renderContact();

    expect(container.querySelector('h2')?.textContent).toBe('Send us a message');
  });

  it('records a successful signed-in submission accurately', async () => {
    testState.user = { id: 'user-123' };
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    renderContact();
    fillContactForm();

    await submitContactForm();

    expect(container.textContent).toContain('Message sent!');
    expect(track).toHaveBeenCalledWith('contact_submit', {
      outcome: 'success',
      signed_in: true,
      status: 200,
    });
  });

  it('records an API rejection without user data', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Please enter a valid email address.' }),
    });
    renderContact();
    fillContactForm();

    await submitContactForm();

    expect(container.textContent).toContain('Message not sent');
    expect(track).toHaveBeenCalledWith('contact_submit', {
      outcome: 'error',
      signed_in: false,
      status: 400,
    });
  });

  it('records a network failure separately', async () => {
    global.fetch.mockRejectedValue(new Error('offline'));
    renderContact();
    fillContactForm();

    await submitContactForm();

    expect(container.textContent).toContain('We could not reach the server');
    expect(track).toHaveBeenCalledWith('contact_submit', {
      outcome: 'network_error',
      signed_in: false,
      status: 0,
    });
  });
});

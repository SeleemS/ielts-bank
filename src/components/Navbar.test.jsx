// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const testState = vi.hoisted(() => ({
  pathname: '/',
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ pathname: testState.pathname }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) =>
    React.createElement('a', { href, ...rest }, children),
}));
vi.mock('next/image', () => ({
  default: ({ alt, ...props }) => React.createElement('img', { alt, ...props }),
}));
vi.mock('../lib/auth', () => ({
  useAuth: () => ({ user: null, loading: false, signOut: vi.fn() }),
}));
vi.mock('../../components/ui/sheet', () => ({
  Sheet: ({ children }) => React.createElement(React.Fragment, null, children),
  SheetContent: ({ children, side: _side, onClose: _onClose, ...props }) =>
    React.createElement(
      'div',
      { 'data-testid': 'mobile-sheet', ...props },
      children
    ),
  SheetHeader: ({ children }) => React.createElement('div', null, children),
  SheetTitle: ({ children }) => React.createElement('div', null, children),
}));
vi.mock('./auth/SignInDialog', () => ({
  default: ({ open, initialMode }) =>
    open
      ? React.createElement('div', {
          'data-testid': 'auth-dialog',
          'data-initial-mode': initialMode,
        })
      : null,
}));

import Navbar from './Navbar';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

function clickButton(label, index = 0) {
  const matches = [...container.querySelectorAll('button')].filter(
    (button) => button.textContent.trim() === label
  );
  expect(matches.length).toBeGreaterThan(index);
  act(() => {
    matches[index].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

beforeEach(() => {
  testState.pathname = '/';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Navbar />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('Navbar authentication intent', () => {
  it('opens the sign-in mode from the desktop account button', () => {
    clickButton('Sign in');
    expect(container.querySelector('[data-testid="auth-dialog"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="auth-dialog"]').getAttribute('data-initial-mode')
    ).toBe('signin');
  });

  it('opens the sign-in mode from the mobile account button', () => {
    clickButton('Sign in', 1);
    expect(
      container.querySelector('[data-testid="auth-dialog"]').getAttribute('data-initial-mode')
    ).toBe('signin');
  });

  it('opens signup mode from practice-page create-account CTAs', () => {
    act(() => root.unmount());
    testState.pathname = '/readingquestion/[id]';
    root = createRoot(container);
    act(() => {
      root.render(<Navbar />);
    });

    clickButton('Create account');
    expect(
      container.querySelector('[data-testid="auth-dialog"]').getAttribute('data-initial-mode')
    ).toBe('signup');
  });
});

describe('Navbar mobile navigation', () => {
  it('gives the sheet an accessible purpose', () => {
    expect(
      container
        .querySelector('[data-testid="mobile-sheet"]')
        ?.getAttribute('aria-label')
    ).toBe('Site navigation');
  });
});

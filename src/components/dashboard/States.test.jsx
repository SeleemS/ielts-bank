// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) =>
    React.createElement('a', { href, ...rest }, children),
}));
vi.mock('../auth/SignInDialog', () => ({
  default: () => null,
}));

import { SignedOutState } from './States';

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

describe('signed-out dashboard semantics', () => {
  it('gives the dashboard prompt the page-level heading', () => {
    act(() => {
      root.render(<SignedOutState />);
    });

    expect(container.querySelector('h1')?.textContent).toBe(
      'Sign in to see your progress'
    );
    expect(container.querySelector('h2, h3, h4, h5, h6')).toBeNull();
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

vi.mock('next/head', () => ({
  default: ({ children }) => React.createElement(React.Fragment, null, children),
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) =>
    React.createElement('a', { href, ...rest }, children),
}));

import ServerErrorPage from '../pages/500';

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

describe('Server error page', () => {
  it('is useful to learners without exposing the error route to search indexes', () => {
    act(() => {
      root.render(<ServerErrorPage />);
    });

    expect(container.querySelector('title')?.textContent).toBe(
      'Something went wrong | IELTS-Bank'
    );
    expect(container.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, nofollow'
    );
    expect(container.querySelector('h1')?.textContent).toBe('Something went wrong');
    expect(container.querySelector('a[href="/"]')?.textContent).toBe('Return home');
    expect(container.querySelector('a[href="/contactus"]')?.textContent).toBe('Contact support');
  });
});

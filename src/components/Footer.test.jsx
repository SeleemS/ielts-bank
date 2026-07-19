// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) =>
    React.createElement('a', { href, ...rest }, children),
}));
vi.mock('next/image', () => ({
  default: ({ alt, ...props }) => React.createElement('img', { alt, ...props }),
}));
vi.mock('../../components/ui/separator', () => ({
  Separator: () => React.createElement('hr'),
}));
vi.mock('./NewsletterSignup', () => ({
  default: () => React.createElement('form', { 'aria-label': 'Newsletter signup' }),
}));

import Footer from './Footer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Footer />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('Footer heading hierarchy', () => {
  it('uses second-level headings for each independent footer section', () => {
    const headings = [...container.querySelectorAll('h2')].map((node) =>
      node.textContent.trim()
    );

    expect(headings).toEqual([
      'Get new practice tests in your inbox',
      'Practice',
      'Tools',
      'Resources',
      'Legal',
    ]);
    expect(container.querySelector('h3, h4, h5, h6')).toBeNull();
  });
});

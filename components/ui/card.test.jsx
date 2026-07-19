// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { CardTitle } from './card';

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
});

describe('CardTitle heading level', () => {
  it('preserves h3 as the reusable default', () => {
    act(() => {
      root.render(<CardTitle>Default card</CardTitle>);
    });

    expect(container.querySelector('h3')?.textContent).toBe('Default card');
  });

  it('supports the surrounding page hierarchy through the as prop', () => {
    act(() => {
      root.render(<CardTitle as="h2">Top-level card section</CardTitle>);
    });

    expect(container.querySelector('h2')?.textContent).toBe(
      'Top-level card section'
    );
    expect(container.querySelector('h3')).toBeNull();
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const testState = vi.hoisted(() => ({
  loading: true,
  isPremium: false,
}));

vi.mock('../lib/usePlan', () => ({
  usePlan: () => ({
    loading: testState.loading,
    isPremium: testState.isPremium,
  }),
}));

import AdUnit from './AdUnit';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

beforeEach(() => {
  testState.loading = true;
  testState.isPremium = false;
  window.adsbygoogle = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete window.adsbygoogle;
  vi.clearAllMocks();
});

describe('AdUnit plan verification', () => {
  it('waits for plan verification before mounting or initializing an ad', async () => {
    await act(async () => {
      root.render(<AdUnit slot="123456" />);
      await Promise.resolve();
    });

    expect(container.querySelector('[aria-label="Advertisement"]')).toBeNull();
    expect(window.adsbygoogle).toHaveLength(0);

    testState.loading = false;
    await act(async () => {
      root.render(<AdUnit slot="123456" />);
      await Promise.resolve();
    });

    expect(container.querySelector('[aria-label="Advertisement"]')).not.toBeNull();
    expect(window.adsbygoogle).toHaveLength(1);

    testState.isPremium = true;
    await act(async () => {
      root.render(<AdUnit slot="123456" />);
      await Promise.resolve();
    });

    expect(container.querySelector('[aria-label="Advertisement"]')).toBeNull();
    expect(window.adsbygoogle).toHaveLength(1);
  });
});

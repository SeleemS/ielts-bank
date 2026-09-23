// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../lib/analytics', () => ({ track: vi.fn() }));
import StickyMobileCta from './StickyMobileCta';
import { track } from '../lib/analytics';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
let observerCallback;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  observerCallback = null;
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function Harness(props) {
  const ref = React.useRef(null);
  return (
    <>
      <div ref={ref}>form</div>
      <StickyMobileCta watchRef={ref} label="Check my essay free" {...props} />
    </>
  );
}

it('never renders without IntersectionObserver', () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  act(() => root.render(<Harness />));
  expect(container.querySelector('[data-testid="sticky-mobile-cta"]')).toBeNull();
});

it('appears only while the watched element is off screen', () => {
  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb) { observerCallback = cb; }
    observe() {}
    disconnect() {}
  });
  const onActivate = vi.fn();
  act(() => root.render(<Harness onActivate={onActivate} hint="First report free" />));
  expect(container.querySelector('[data-testid="sticky-mobile-cta"]')).toBeNull();

  act(() => observerCallback([{ isIntersecting: false }]));
  const bar = container.querySelector('[data-testid="sticky-mobile-cta"]');
  expect(bar).not.toBeNull();
  expect(bar.className).toContain('sm:hidden');
  expect(bar.textContent).toContain('First report free');

  act(() => bar.querySelector('button').click());
  expect(onActivate).toHaveBeenCalledTimes(1);
  expect(track).toHaveBeenCalledWith('sticky_cta_click', { source: 'sticky_mobile_cta' });

  act(() => observerCallback([{ isIntersecting: true }]));
  expect(container.querySelector('[data-testid="sticky-mobile-cta"]')).toBeNull();
});

it('stays hidden when the page says so (e.g. while scoring or showing a result)', () => {
  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb) { observerCallback = cb; }
    observe() {}
    disconnect() {}
  });
  act(() => root.render(<Harness hidden />));
  act(() => observerCallback([{ isIntersecting: false }]));
  expect(container.querySelector('[data-testid="sticky-mobile-cta"]')).toBeNull();
});

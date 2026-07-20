// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import StudyingNowBadge from './StudyingNowBadge';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.8);
  window.sessionStorage.clear();
  window.sessionStorage.setItem('ielts-bank:studying-now:v1', '30');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('StudyingNowBadge', () => {
  it('persists and visibly advances its bounded live count', () => {
    act(() => {
      root.render(<StudyingNowBadge />);
    });
    const badge = container.querySelector('[data-testid="studying-now-badge"]');
    expect(badge.getAttribute('aria-label')).toBe('30 people studying now');

    // A 0.8 random value schedules the next update at 49 seconds and moves the
    // middle-of-range count upward by one.
    act(() => {
      vi.advanceTimersByTime(49000);
    });

    expect(badge.getAttribute('aria-label')).toBe('31 people studying now');
    expect(window.sessionStorage.getItem('ielts-bank:studying-now:v1')).toBe('31');
  });
});

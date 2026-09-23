// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }));
import ScoringExplainer, { SCORING_POINTS } from './ScoringExplainer';

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

it('explains scoring and links to the accuracy page', () => {
  act(() => root.render(<ScoringExplainer />));
  for (const point of SCORING_POINTS) expect(container.textContent).toContain(point.title);
  expect(container.querySelector('a[href="/ielts-writing-checker-accuracy"]')).not.toBeNull();
});

it('makes no numeric accuracy claim until a calibration run is published', () => {
  act(() => root.render(<ScoringExplainer />));
  // Accuracy percentages / "within half a band" belong on the calibration
  // page, gated by lib/calibrationStats.js — never hard-coded here.
  expect(container.textContent).not.toMatch(/\d+\s?%/);
  expect(container.textContent.toLowerCase()).not.toContain('within half a band');
  expect(container.textContent).toContain('not an official score');
});

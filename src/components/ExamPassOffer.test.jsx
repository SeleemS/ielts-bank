// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
vi.mock('../lib/analytics', () => ({ track: vi.fn() }));
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }));
import ExamPassOffer, { lockedValueLines, perDay } from './ExamPassOffer';
import { track } from '../lib/analytics';
import { OFFER_VERSION } from '../../lib/monetizationExperiment';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container, root, observed, disconnect;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  disconnect = vi.fn();
  vi.stubGlobal('IntersectionObserver', class { constructor(callback) { observed = callback; } observe() {} disconnect() { disconnect(); } });
  window.history.replaceState({}, '', '/writingquestion/example-task');
  document.cookie = 'ib_country=US; path=/';
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

it('compares regional no-renewal and monthly options with a safe return and one primary action', () => {
  document.cookie = 'ib_country=EG; path=/';
  act(() => root.render(<ExamPassOffer skill="writing" source="score_tease" band={6} locked={{ corrections: 4, rewrite: true }} />));
  expect(container.textContent).toContain('$5.99 USD');
  expect(container.textContent).toContain('$3.99 USD/month');
  expect(container.textContent).toContain('about $0.20 a day');
  expect(container.textContent).toContain('Illustrative excerpt');
  expect(container.textContent).toContain('not your result');
  expect(container.textContent).toContain('No automatic renewal');
  expect(container.textContent).toContain('Get the full report on your next essay');
  expect(container.textContent).toContain('this essay had 4 more we held back');
  expect(container.textContent).toContain('14-day money-back guarantee');
  // Honest expectation: buying never unlocks the old free sample.
  expect(container.textContent).toContain('this free sample stays as it is');
  const links = container.querySelectorAll('a'); expect(links).toHaveLength(1);
  expect(links[0].textContent).toContain('Continue to the Exam Pass');
  const href = new URL(links[0].href, 'https://example.test');
  expect(href.searchParams.get('return_to')).toBe('/writingquestion/example-task');
  expect(href.searchParams.get('stage')).toBe('sample');
  links[0].addEventListener('click', event => event.preventDefault());
  act(() => links[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  expect(track).toHaveBeenCalledWith('exam_pass_offer_click', expect.objectContaining({ sku: 'exam_pass', skill: 'writing', offer_version: OFFER_VERSION, pass_first: true }));
});
it('labels the pass as one payment with no auto-renew in pass-first markets', () => {
  document.cookie = 'ib_country=IN; path=/';
  act(() => root.render(<ExamPassOffer skill="writing" source="score_tease" band={6} />));
  expect(container.textContent).toContain('$5.99 USD · One payment · no auto-renew');
  expect(container.textContent).toContain('Prefer a subscription? Monthly is $3.99 USD/month');
  document.cookie = 'ib_country=CN; path=/';
  act(() => root.unmount()); root = createRoot(container);
  act(() => root.render(<ExamPassOffer skill="writing" source="score_tease" band={6} />));
  expect(container.textContent).toContain('$14.99 USD · One payment · no auto-renew');
});
it('keeps the standard offer copy outside pass-first markets', () => {
  act(() => root.render(<ExamPassOffer skill="writing" source="score_tease" band={6} />));
  expect(container.textContent).toContain('$14.99 USD · one payment');
  expect(container.textContent).not.toContain('no auto-renew');
  expect(container.textContent).toContain('Monthly is $8.99 USD/month');
});

it('uses global pricing and records exposure once only when the offer is visible', () => {
  act(() => root.render(<ExamPassOffer skill="speaking" source="speaking_sample" />));
  expect(container.textContent).toContain('$14.99 USD');
  expect(container.textContent).toContain('about $0.50 a day');
  expect(container.textContent).toContain('on your next recording');
  expect(track).not.toHaveBeenCalled();
  observed([{ isIntersecting: false }]); expect(track).not.toHaveBeenCalled();
  observed([{ isIntersecting: true, intersectionRatio: 0.5 }]); observed([{ isIntersecting: true, intersectionRatio: 0.5 }]);
  expect(track).toHaveBeenCalledTimes(1);
  expect(track).toHaveBeenCalledWith('exam_pass_offer_view', expect.objectContaining({ skill: 'speaking', stage: 'sample' }));
  expect(disconnect).toHaveBeenCalled();
});

it('only states withheld counts that the free payload actually reported', () => {
  const generic = lockedValueLines('writing');
  expect(generic[0]).toBe('Every corrected sentence, not just the first');
  expect(generic.join(' ')).not.toMatch(/this essay/);
  const specific = lockedValueLines('writing', { corrections: 3, rewrite: true });
  expect(specific[0]).toContain('this essay had 3 more');
  expect(specific[1]).toContain('one was written for this essay');
  expect(lockedValueLines('writing', { corrections: -1 })[0]).toBe('Every corrected sentence, not just the first');
});

it('computes a plain per-day cost', () => {
  expect(perDay(14.99, 30)).toBe('$0.50');
  expect(perDay(5.99, 30)).toBe('$0.20');
  expect(perDay(14.99, 45)).toBe('$0.33');
  expect(perDay(Number.NaN, 30)).toBeNull();
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { PRACTICE_EVENT } from '../src/lib/practiceActivity';

const testState = vi.hoisted(() => ({
  user: { id: 'user-1' },
  isPremium: false,
  planLoading: false,
  pathname: '/readingquestion',
  push: null,
  setLocalPref: null,
  saveUserPref: null,
  track: null,
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ pathname: testState.pathname, push: testState.push }),
}));
vi.mock('../src/lib/auth', () => ({
  useAuth: () => ({ user: testState.user }),
}));
vi.mock('../src/lib/usePlan', () => ({
  usePlan: () => ({ isPremium: testState.isPremium, loading: testState.planLoading }),
}));
vi.mock('../src/lib/analytics', () => ({
  track: (...args) => testState.track(...args),
}));
vi.mock('../src/lib/prefs', () => ({
  getLocalPref: () => null,
  setLocalPref: (...args) => testState.setLocalPref(...args),
  loadUserPref: async () => null,
  saveUserPref: (...args) => testState.saveUserPref(...args),
}));
vi.mock('../src/lib/saleConfig', () => ({
  SALE: { name: 'Summer Sale', endsAt: '2026-07-31T23:59:59-04:00', tagline: 'Lowest price of the year.' },
  isSaleLive: () => true,
  saleEndsAtMs: () => Date.now() + 5 * 86400000,
}));

import OfferReminderModal from '../src/components/OfferReminderModal';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

async function render() {
  await act(async () => {
    root.render(<OfferReminderModal />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function answerQuestions(count) {
  await act(async () => {
    window.dispatchEvent(new CustomEvent(PRACTICE_EVENT, { detail: { count } }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  testState.user = { id: 'user-1' };
  testState.isPremium = false;
  testState.planLoading = false;
  testState.pathname = '/readingquestion';
  testState.push = vi.fn();
  testState.setLocalPref = vi.fn();
  testState.saveUserPref = vi.fn();
  testState.track = vi.fn();
  window.sessionStorage.clear();
  window.localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('OfferReminderModal', () => {
  it('stays hidden until enough questions are answered', async () => {
    await render();
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await answerQuestions(3);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('appears on the fourth graded submit for a signed-in free user', async () => {
    await render();
    await answerQuestions(4);

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain('Summer Sale is on');
    expect(dialog.textContent).toContain('See the Summer Sale');
    expect(testState.track).toHaveBeenCalledWith('sale_reminder_shown', {
      count: 4,
      appearance: 1,
    });
  });

  it('routes to pricing when the offer CTA is clicked', async () => {
    await render();
    await answerQuestions(4);

    const cta = [...document.querySelectorAll('[role="dialog"] button')].find((b) =>
      b.textContent.includes('See the Summer Sale')
    );
    await act(async () => {
      cta.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(testState.track).toHaveBeenCalledWith('sale_reminder_click', { destination: 'pricing' });
    expect(testState.push).toHaveBeenCalledWith('/pricing');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('persists a mute when "Don\'t remind me" is chosen', async () => {
    await render();
    await answerQuestions(4);

    const mute = [...document.querySelectorAll('[role="dialog"] button')].find((b) =>
      b.textContent.includes("Don't remind me")
    );
    await act(async () => {
      mute.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(testState.setLocalPref).toHaveBeenCalledWith('saleReminderMuted', true);
    expect(testState.saveUserPref).toHaveBeenCalledWith('user-1', 'saleReminderMuted', true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('never shows for premium users', async () => {
    testState.isPremium = true;
    await render();
    await answerQuestions(10);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('does not interrupt on the pricing page', async () => {
    testState.pathname = '/pricing';
    await render();
    await answerQuestions(4);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

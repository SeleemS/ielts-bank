// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ user: null, used: false, nextFreeAt: null }));
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('../../lib/usePlan', () => ({ usePlan: () => ({ loading: false, isPremium: false }) }));
vi.mock('../../lib/useFreeWritingSample', () => ({ useFreeWritingSample: () => ({ loading: false, used: state.used, nextFreeAt: state.nextFreeAt }) }));
import FreeSampleChip from './FreeSampleChip';
beforeEach(() => { state.user = null; state.used = false; state.nextFreeAt = null; });
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe('FreeSampleChip current catalog rendering', () => {
  it('renders signed-out writing guidance without resolving a retired plan', () => {
    expect(renderToStaticMarkup(<FreeSampleChip />)).toContain('Includes one free AI score');
  });
  it('links used samples to current regional pricing without assuming a retired SKU', () => {
    state.user = { id: 'qa' }; state.used = true;
    const html = renderToStaticMarkup(<FreeSampleChip />);
    expect(html).toContain('/pricing?upgrade=writing');
    expect(html).toContain('See Pro plans');
  });
  it('keeps lifetime copy and shows no refill date by default', () => {
    state.user = { id: 'qa' }; state.used = true; state.nextFreeAt = new Date('2026-09-30T10:00:00Z');
    const html = renderToStaticMarkup(<FreeSampleChip />);
    expect(html).toContain('Your free sample is used');
    expect(html).not.toContain('unlocks on');
  });
});

describe('FreeSampleChip with NEXT_PUBLIC_FREE_SCORE_PERIOD=weekly', () => {
  async function weeklyChip() {
    vi.stubEnv('NEXT_PUBLIC_FREE_SCORE_PERIOD', 'weekly');
    vi.resetModules();
    return (await import('./FreeSampleChip')).default;
  }
  it('says when the next free score unlocks once this week’s is used', async () => {
    const Chip = await weeklyChip();
    state.user = { id: 'qa' }; state.used = true; state.nextFreeAt = new Date('2026-09-30T10:00:00Z');
    const html = renderToStaticMarkup(<Chip />);
    expect(html).toContain('This week’s free score is used');
    expect(html).toMatch(/Your next free Writing score unlocks on \w{3} \d{1,2} \w{3,4}\./);
    expect(html).toContain('/pricing?upgrade=writing');
  });
  it('advertises the weekly allowance to signed-out visitors', async () => {
    const Chip = await weeklyChip();
    expect(renderToStaticMarkup(<Chip />)).toContain('Includes a free AI score every week');
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const testState = vi.hoisted(() => ({
  patch: vi.fn(),
  save: vi.fn(),
  track: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({
      update: (fields) => {
        testState.patch(fields);
        return { eq: () => ({ select: () => ({ maybeSingle: testState.save }) }) };
      },
    }),
  }),
}));
vi.mock('../../lib/analytics', () => ({ track: testState.track }));

import PlanSetupCard from './PlanSetupCard';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
const user = { id: 'user-1' };

async function render(profile, onProfileChange = vi.fn()) {
  await act(async () => {
    root.render(<PlanSetupCard user={user} profile={profile} onProfileChange={onProfileChange} />);
  });
  return onProfileChange;
}

const button = (label) =>
  [...container.querySelectorAll('button')].find((node) => node.textContent.trim() === label);

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  testState.patch.mockReset();
  testState.track.mockReset();
  testState.save.mockReset();
  testState.save.mockImplementation(async () => ({
    data: { display_name: null, target_band: 7, exam_date: null, prefs: { goal: 'study', planSetupAt: 'now' } },
    error: null,
  }));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('PlanSetupCard', () => {
  it('renders nothing once answered or dismissed', async () => {
    await render({ prefs: { goal: 'study' } });
    expect(container.textContent).toBe('');
    expect(testState.track).not.toHaveBeenCalled();
  });

  it('saves the chosen answers and reports them', async () => {
    const onProfileChange = await render({ prefs: { dashboardWeeklyGoal: 5 } });
    expect(testState.track).toHaveBeenCalledWith('plan_setup_shown', { source: 'dashboard' });
    expect(button('Save my plan').disabled).toBe(true);

    await act(async () => button('Study abroad').click());
    await act(async () => button('7.0').click());
    await act(async () => button('I teach IELTS').click());
    await act(async () => button('Save my plan').click());

    const patch = testState.patch.mock.calls[0][0];
    expect(patch.target_band).toBe(7);
    expect(patch.prefs).toMatchObject({ dashboardWeeklyGoal: 5, goal: 'study', role: 'teacher' });
    expect(onProfileChange).toHaveBeenCalled();
    expect(testState.track).toHaveBeenCalledWith(
      'onboarding_answered',
      expect.objectContaining({ goal: 'study', target_band: '7.0', role: 'teacher', has_exam_date: false })
    );
  });

  it('records a skip so the card does not return', async () => {
    await render({ prefs: {} });
    await act(async () => button('Skip for now').click());
    expect(testState.patch.mock.calls[0][0].prefs.planSetupDismissedAt).toBeTruthy();
    expect(testState.track).toHaveBeenCalledWith('plan_setup_dismissed', { source: 'dashboard' });
  });
});

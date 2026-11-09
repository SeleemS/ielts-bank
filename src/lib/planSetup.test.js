import { describe, expect, it } from 'vitest';
import { buildPlanDismissPatch, buildPlanSetupPatch, hasAnyAnswer, planSetupDone } from './planSetup';

const NOW = new Date('2026-11-09T12:00:00Z');

describe('planSetup', () => {
  it('writes answers into prefs and the two profile columns', () => {
    const patch = buildPlanSetupPatch(
      { prefs: { dashboardWeeklyGoal: 5 } },
      { goal: 'study', testType: 'academic', band: '8.0+', examDate: '2026-12-01', destination: 'ca', role: 'teacher' },
      NOW
    );
    expect(patch.target_band).toBe(8);
    expect(patch.exam_date).toBe('2026-12-01');
    expect(patch.prefs).toMatchObject({
      dashboardWeeklyGoal: 5,
      goal: 'study',
      testType: 'academic',
      destination: 'ca',
      role: 'teacher',
      examDate: '2026-12-01',
      planSetupAt: NOW.toISOString(),
    });
  });

  it('drops unknown keys and past exam dates', () => {
    const patch = buildPlanSetupPatch({}, { goal: 'hack', band: '12', examDate: '2026-01-01', destination: 'zz' }, NOW);
    expect(patch).not.toHaveProperty('target_band');
    expect(patch).not.toHaveProperty('exam_date');
    expect(patch.prefs.goal).toBeUndefined();
    expect(patch.prefs.destination).toBeUndefined();
  });

  it('accepts an exam date of today', () => {
    expect(buildPlanSetupPatch({}, { examDate: '2026-11-09' }, NOW).exam_date).toBe('2026-11-09');
  });

  it('treats answered, dismissed and legacy-goal profiles as done', () => {
    expect(planSetupDone({ prefs: {} })).toBe(false);
    expect(planSetupDone(null)).toBe(false);
    expect(planSetupDone({ prefs: { goal: 'study' } })).toBe(true);
    expect(planSetupDone({ prefs: { planSetupAt: 'x' } })).toBe(true);
    expect(planSetupDone({ prefs: buildPlanDismissPatch({ prefs: { a: 1 } }, NOW).prefs })).toBe(true);
  });

  it('keeps existing prefs when dismissing', () => {
    expect(buildPlanDismissPatch({ prefs: { a: 1 } }, NOW).prefs).toEqual({
      a: 1,
      planSetupDismissedAt: NOW.toISOString(),
    });
  });

  it('knows when nothing was answered', () => {
    expect(hasAnyAnswer({})).toBe(false);
    expect(hasAnyAnswer({ role: 'teacher' })).toBe(true);
  });
});

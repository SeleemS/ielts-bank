// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PRACTICE_EVENT,
  isGradedSubmitEvent,
  getPracticeActivityCount,
  recordPracticeActivity,
} from './practiceActivity';

afterEach(() => {
  window.sessionStorage.clear();
});

describe('practiceActivity graded-submit detection', () => {
  it('only counts the three graded submit events', () => {
    expect(isGradedSubmitEvent('attempt_submit')).toBe(true);
    expect(isGradedSubmitEvent('writing_submit')).toBe(true);
    expect(isGradedSubmitEvent('speaking_submit')).toBe(true);
    expect(isGradedSubmitEvent('page_view')).toBe(false);
    expect(isGradedSubmitEvent('ai_score_result')).toBe(false);
  });
});

describe('practiceActivity counter', () => {
  it('starts at zero and ignores non-submit events', () => {
    expect(getPracticeActivityCount()).toBe(0);
    expect(recordPracticeActivity('page_view')).toBe(0);
    expect(recordPracticeActivity('checkout_start')).toBe(0);
    expect(getPracticeActivityCount()).toBe(0);
  });

  it('increments once per graded submit across skills', () => {
    expect(recordPracticeActivity('attempt_submit')).toBe(1);
    expect(recordPracticeActivity('writing_submit')).toBe(2);
    expect(recordPracticeActivity('speaking_submit')).toBe(3);
    expect(getPracticeActivityCount()).toBe(3);
  });

  it('broadcasts the new count so the reminder can react', () => {
    const handler = vi.fn();
    window.addEventListener(PRACTICE_EVENT, handler);
    recordPracticeActivity('attempt_submit');
    recordPracticeActivity('attempt_submit');
    window.removeEventListener(PRACTICE_EVENT, handler);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][0].detail).toEqual({ count: 1 });
    expect(handler.mock.calls[1][0].detail).toEqual({ count: 2 });
  });

  it('does not broadcast for non-submit events', () => {
    const handler = vi.fn();
    window.addEventListener(PRACTICE_EVENT, handler);
    recordPracticeActivity('page_view');
    window.removeEventListener(PRACTICE_EVENT, handler);
    expect(handler).not.toHaveBeenCalled();
  });
});

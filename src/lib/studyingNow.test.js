import { describe, expect, it } from 'vitest';
import {
  initialStudyingNowCount,
  nextStudyingNowCount,
  nextStudyingNowDelay,
  STUDYING_NOW_MAX,
  STUDYING_NOW_MIN,
} from './studyingNow';

describe('studying-now placeholder model', () => {
  it('always seeds within the configured 10–50 range', () => {
    for (let minute = 0; minute < 500; minute += 1) {
      const count = initialStudyingNowCount(minute * 60000);
      expect(count).toBeGreaterThanOrEqual(STUDYING_NOW_MIN);
      expect(count).toBeLessThanOrEqual(STUDYING_NOW_MAX);
    }
  });

  it('moves in small realistic steps through the middle of the range', () => {
    expect(nextStudyingNowCount(30, () => 0)).toBe(28);
    expect(nextStudyingNowCount(30, () => 0.2)).toBe(29);
    expect(nextStudyingNowCount(30, () => 0.5)).toBe(30);
    expect(nextStudyingNowCount(30, () => 0.8)).toBe(31);
    expect(nextStudyingNowCount(30, () => 0.99)).toBe(32);
  });

  it('biases back inward at the safe bounds', () => {
    expect(nextStudyingNowCount(10, () => 0.9)).toBe(12);
    expect(nextStudyingNowCount(50, () => 0)).toBe(48);
    expect(nextStudyingNowCount(50, () => 0.99)).toBe(50);
  });

  it('updates at irregular intervals between 25 and 55 seconds', () => {
    expect(nextStudyingNowDelay(() => 0)).toBe(25000);
    expect(nextStudyingNowDelay(() => 0.999999)).toBeLessThanOrEqual(55000);
    expect(nextStudyingNowDelay(() => 0.5)).toBeGreaterThan(25000);
  });
});

import { describe, expect, it } from 'vitest';
import {
  estimatedAverageUserBand,
  formatAverageUserBand,
  resolveAverageUserBand,
} from './averageUserBand';

describe('average user band display', () => {
  it('keeps seeded estimates deterministic and correlated with difficulty', () => {
    const id = 'a-walking-tour';
    const easy = estimatedAverageUserBand(id, 'easy');
    const medium = estimatedAverageUserBand(id, 'medium');
    const hard = estimatedAverageUserBand(id, 'hard');

    expect(easy - medium).toBe(1);
    expect(medium - hard).toBe(1);
    expect(estimatedAverageUserBand(id, 'easy')).toBe(easy);
    expect([4.5, 5, 5.5]).toContain(hard);
  });

  it('uses the stored aggregate and marks it real after the first submission', () => {
    expect(
      resolveAverageUserBand({
        id: 'task-two',
        difficulty: 'medium',
        averageUserBand: '6.25',
        submissionCount: 4,
      })
    ).toEqual({ value: 6.25, isEstimated: false, submissionCount: 4 });
  });

  it('keeps a zero-submission stored seed visibly estimated', () => {
    const resolved = resolveAverageUserBand({
      id: 'airport-taxi',
      difficulty: 'easy',
      averageUserBand: '7.0',
      submissionCount: 0,
    });

    expect(resolved).toEqual({ value: 7, isEstimated: true, submissionCount: 0 });
    expect(formatAverageUserBand(resolved.value)).toBe('7.0');
  });
});

import { describe, expect, it } from 'vitest';
import {
  READING_SET,
  LISTENING_SET,
  SPEAKING_SELF_ASSESSMENT,
  WRITING_SELF_ASSESSMENT,
  selectGroups,
} from './estimatorConfig';

// Every point total reachable from a self-assessment's questions: each question
// contributes exactly one option's points, so totals range over all sums of one
// point value per question.
function reachableTotals(assessment) {
  const perQuestion = assessment.questions.map((q) => q.options.map((o) => o.points));
  return perQuestion.reduce(
    (totals, points) => totals.flatMap((t) => points.map((p) => t + p)),
    [0]
  );
}

describe.each([
  ['writing', WRITING_SELF_ASSESSMENT],
  ['speaking', SPEAKING_SELF_ASSESSMENT],
])('%s self-assessment band ranges', (skill, assessment) => {
  const ranges = assessment.bandRanges;

  it('has exactly 3 questions with 3 options each', () => {
    expect(assessment.questions).toHaveLength(3);
    for (const q of assessment.questions) {
      expect(q.options).toHaveLength(3);
    }
  });

  it('covers every reachable point total with exactly one range', () => {
    const totals = new Set(reachableTotals(assessment));
    for (const total of totals) {
      const matches = ranges.filter((r) => total >= r.minPoints && total <= r.maxPoints);
      expect(matches, `total ${total} must map to exactly one range`).toHaveLength(1);
    }
  });

  it('has no gaps or overlaps across the covered point domain', () => {
    const sorted = [...ranges].sort((a, b) => a.minPoints - b.minPoints);
    for (const r of sorted) {
      expect(r.maxPoints).toBeGreaterThanOrEqual(r.minPoints);
    }
    for (let i = 1; i < sorted.length; i += 1) {
      // Each range must start exactly one point after the previous one ends:
      // no overlap (would be <=) and no gap (would be >1).
      expect(sorted[i].minPoints).toBe(sorted[i - 1].maxPoints + 1);
    }
  });

  it('keeps every band range at most 1.0 wide, in 0.5 steps within 4.0–8.0', () => {
    for (const r of ranges) {
      const width = r.band.max - r.band.min;
      expect(width).toBeGreaterThan(0);
      expect(width).toBeLessThanOrEqual(1.0 + 1e-9);
      for (const edge of [r.band.min, r.band.max]) {
        expect(edge).toBeGreaterThanOrEqual(4.0);
        expect(edge).toBeLessThanOrEqual(8.0);
        expect(Math.round(edge * 2)).toBeCloseTo(edge * 2, 10); // half-band steps
      }
    }
  });

  it('maps higher point totals to non-decreasing bands', () => {
    const sorted = [...ranges].sort((a, b) => a.minPoints - b.minPoints);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].band.min).toBeGreaterThanOrEqual(sorted[i - 1].band.min);
      expect(sorted[i].band.max).toBeGreaterThanOrEqual(sorted[i - 1].band.max);
    }
  });
});

describe('selectGroups', () => {
  const passage = { groups: [{ id: 'g0' }, { id: 'g1' }, { id: 'g2' }, { id: 'g3' }] };

  it('resolves group indexes in order without renumbering', () => {
    const result = selectGroups(passage, READING_SET);
    expect(result.map((g) => g.id)).toEqual(['g1', 'g2', 'g3']);
  });

  it('drops out-of-range indexes and tolerates missing groups', () => {
    expect(selectGroups({ groups: [] }, LISTENING_SET)).toEqual([]);
    expect(selectGroups({}, READING_SET)).toEqual([]);
    expect(selectGroups(null, READING_SET)).toEqual([]);
  });
});

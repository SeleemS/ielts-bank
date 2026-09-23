import { describe, expect, it } from 'vitest';
import { dailyCost, recommendedSku, timelineFromExamDays, TIMELINES } from './planFit';
import { planPricing, PLANS } from './saleConfig';

describe('planFit', () => {
  it('maps every timeline to a plan that is actually on sale', () => {
    for (const t of TIMELINES) expect(PLANS[t.sku]).toBeTruthy();
  });

  it('recommends the plan that fits the exam timeline', () => {
    expect(recommendedSku('soon')).toBe('exam_pass');
    expect(recommendedSku('months')).toBe('monthly');
    expect(recommendedSku('later')).toBe('annual');
    expect(recommendedSku(null)).toBe('exam_pass');
    expect(recommendedSku('nonsense', 'monthly')).toBe('monthly');
  });

  it('derives a timeline from a saved exam date', () => {
    expect(timelineFromExamDays(0)).toBe('soon');
    expect(timelineFromExamDays(30)).toBe('soon');
    expect(timelineFromExamDays(31)).toBe('months');
    expect(timelineFromExamDays(92)).toBe('months');
    expect(timelineFromExamDays(200)).toBe('later');
    expect(timelineFromExamDays(null)).toBeNull();
    expect(timelineFromExamDays(-3)).toBeNull();
  });

  it('computes daily cost from the real list prices', () => {
    expect(dailyCost(planPricing('exam_pass'))).toBe(0.5);
    expect(dailyCost(planPricing('monthly'))).toBe(0.3);
    expect(dailyCost(planPricing('annual'))).toBe(0.14);
    expect(dailyCost(planPricing('exam_pass', true))).toBe(0.2);
    expect(dailyCost(null)).toBeNull();
  });
});

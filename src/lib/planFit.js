// src/lib/planFit.js
// Which Pro plan fits a learner's exam timeline. Display-only: it decides which
// card the pricing page highlights, never what checkout charges (prices live in
// saleConfig.js and are re-verified server-side in pages/api/billing/checkout).

export const TIMELINES = [
  { key: 'soon', label: 'Within 30 days', sku: 'exam_pass', why: 'One payment covers you to test day, and it never renews.' },
  { key: 'months', label: 'In 1–3 months', sku: 'monthly', why: 'Pay month to month and cancel in one click once your test is done.' },
  { key: 'later', label: 'Not booked / 3+ months', sku: 'annual', why: 'The lowest monthly rate, with room for a retake.' },
];

export function timelineByKey(key) {
  return TIMELINES.find((t) => t.key === key) || null;
}

// Map a real exam date (days away) to a timeline, so a learner who already
// told us their test date sees the matching plan without clicking.
export function timelineFromExamDays(days) {
  if (days == null || !Number.isFinite(days) || days < 0) return null;
  if (days <= 30) return 'soon';
  if (days <= 92) return 'months';
  return 'later';
}

export function recommendedSku(timelineKey, fallback = 'exam_pass') {
  return timelineByKey(timelineKey)?.sku || fallback;
}

// Plain daily cost: price over the days one purchase covers. Honest arithmetic
// for comparison, not a reframed price — the card still shows the real charge.
export function dailyCost(plan) {
  if (!plan || !Number.isFinite(plan.price)) return null;
  const days = plan.isOneTime
    ? plan.days
    : plan.interval === 'year'
      ? 365 * (plan.intervalCount || 1)
      : 30 * (plan.intervalCount || 1);
  if (!days) return null;
  return Math.round((plan.price / days) * 100) / 100;
}

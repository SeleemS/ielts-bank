// src/lib/saleConfig.js
// Single source of truth for the current Premium pricing + the Summer Sale.
//
// IMPORTANT — how prices actually get charged:
//   The `sale` amounts below are the REAL prices. Stripe charges whatever its
//   prices (resolved by lookup_key in lib/billing.js) are set to, NOT these
//   strings. For the charged amount to match what this page shows, the Stripe
//   prices must be:
//     premium_monthly       -> $14.99   (was $9.99)
//     premium_6month        -> $49.99   (was $29.99)
//     premium_monthly_ppp   -> $3.99    (unchanged — regional)
//     premium_6month_ppp    -> $14.99   (unchanged — regional)
//   The `regular` amounts ($19.99 / $69.99) are struck-through marketing
//   anchors only; they are never charged.
//
// Ending the sale: set SALE.active = false (or let SALE.endsAt pass). The promo
// chrome (badge, countdown, struck price, savings) disappears and the `sale`
// price shows as the plain price — because the sale price IS the real price.

// ---------------------------------------------------------------------------
// Sale window + copy
// ---------------------------------------------------------------------------
export const SALE = {
  active: true,
  name: 'Summer Sale',
  // Editable end date. Explicit offset so the countdown is unambiguous across
  // timezones. Change this one line to extend or end the promotion.
  endsAt: '2026-07-31T23:59:59-04:00',
  // Short line reused on the pricing hero and in the reminder modal.
  tagline: 'Premium at its lowest price of the year.',
};

export function saleEndsAtMs() {
  const ms = new Date(SALE.endsAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

// Whether the promotional treatment should render. Pass a clock for tests.
export function isSaleLive(now = Date.now()) {
  return Boolean(SALE.active) && now < saleEndsAtMs();
}

// ---------------------------------------------------------------------------
// Plans — the single "Pro" plan, billed monthly or every 6 months.
// Amounts are USD numbers so savings/percentages compute without string drift.
// `sale` = real (charged) price; `regular` = struck anchor.
// ---------------------------------------------------------------------------
export const PLANS = {
  monthly: {
    sku: 'monthly',
    name: 'Monthly',
    cadence: 'per month',
    global: { sale: 14.99, regular: 19.99 },
    ppp: { sale: 3.99, regular: 4.99 },
  },
  '6month': {
    sku: '6month',
    name: '6 months',
    cadence: 'every 6 months',
    best: true,
    global: { sale: 49.99, regular: 69.99 },
    ppp: { sale: 14.99, regular: 19.99 },
  },
};

export const money = (value) => `$${Number(value).toFixed(2)}`;

// Resolve the display numbers for one plan in one region, including derived
// savings and the effective monthly rate for the 6-month option.
export function planPricing(planKey, ppp = false) {
  const plan = PLANS[planKey];
  if (!plan) return null;
  const source = ppp ? plan.ppp : plan.global;
  const sale = source.sale;
  const regular = source.regular;
  const savings = Math.round((regular - sale) * 100) / 100;
  const percentOff = regular > 0 ? Math.round((1 - sale / regular) * 100) : 0;
  const perMonth = planKey === '6month' ? sale / 6 : null;
  return { sku: plan.sku, name: plan.name, cadence: plan.cadence, best: Boolean(plan.best), sale, regular, savings, percentOff, perMonth };
}

// Largest savings across plans in a region — used for headline copy
// ("Save up to $20"). Global-only by default; the modal shows the global line.
export function maxSavings(ppp = false) {
  return Object.keys(PLANS).reduce((max, key) => {
    const p = planPricing(key, ppp);
    return p && p.savings > max ? p.savings : max;
  }, 0);
}

// Largest percentage off across plans in a region ("up to 29% off").
export function maxPercentOff(ppp = false) {
  return Object.keys(PLANS).reduce((max, key) => {
    const p = planPricing(key, ppp);
    return p && p.percentOff > max ? p.percentOff : max;
  }, 0);
}

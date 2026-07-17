// scripts/setup-stripe-catalog.mjs
// Idempotently creates the Stripe catalog for docs/MONETIZATION.md §3:
//   * one product: "IELTS Bank Premium"
//   * six recurring USD prices, addressed by lookup_key (3 global + 3 PPP)
//   * a 100%-off coupon + promotion code used ONLY for E2E flow verification
//
//   node scripts/setup-stripe-catalog.mjs
//
// Reads STRIPE_SECRET_KEY from .env.local (same pattern as apply-rate-limits.mjs).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadEnvLocal() {
  const raw = readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[m[1]] = val;
  }
  return env;
}

const env = loadEnvLocal();
const KEY = env.STRIPE_SECRET_KEY;
if (!KEY) {
  console.error('STRIPE_SECRET_KEY missing from .env.local');
  process.exit(1);
}

const API = 'https://api.stripe.com/v1';

function form(params, prefix = '') {
  // Flatten nested objects/arrays into Stripe's form encoding.
  const out = [];
  for (const [k, v] of Object.entries(params)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (typeof v === 'object' && !Array.isArray(v)) out.push(form(v, key));
    else if (Array.isArray(v)) v.forEach((item, i) => out.push(form({ [i]: item }, key)));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out.filter(Boolean).join('&');
}

async function stripe(method, pathname, params) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: method === 'GET' ? undefined : form(params || {}),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`${method} ${pathname} -> ${res.status}: ${json.error?.message || 'unknown'}`);
  }
  return json;
}

async function stripeGet(pathname, params) {
  const qs = params ? `?${form(params)}` : '';
  const res = await fetch(`${API}${pathname}${qs}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`GET ${pathname} -> ${res.status}: ${json.error?.message || 'unknown'}`);
  }
  return json;
}

const PRICES = [
  { lookup_key: 'premium_monthly',     unit_amount: 999,  interval: 'month', interval_count: 1,  nickname: 'Premium Monthly (global)' },
  { lookup_key: 'premium_6month',      unit_amount: 2999, interval: 'month', interval_count: 6,  nickname: 'Premium 6-Month hero (global)' },
  { lookup_key: 'premium_annual',      unit_amount: 4499, interval: 'year',  interval_count: 1,  nickname: 'Premium Annual (global)' },
  { lookup_key: 'premium_monthly_ppp', unit_amount: 399,  interval: 'month', interval_count: 1,  nickname: 'Premium Monthly (PPP)' },
  { lookup_key: 'premium_6month_ppp',  unit_amount: 1499, interval: 'month', interval_count: 6,  nickname: 'Premium 6-Month hero (PPP)' },
  { lookup_key: 'premium_annual_ppp',  unit_amount: 1999, interval: 'year',  interval_count: 1,  nickname: 'Premium Annual (PPP)' },
];

async function main() {
  // 1. Product (idempotent via metadata marker)
  const products = await stripeGet('/products', { limit: 100, active: true });
  let product = products.data.find((p) => p.metadata?.ieltsbank === 'premium');
  if (!product) {
    product = await stripe('POST', '/products', {
      name: 'IELTS Bank Premium',
      description:
        'Unlimited AI Writing & Speaking scoring (fair use), AI examiner minutes, progress analytics, ad-free.',
      metadata: { ieltsbank: 'premium' },
    });
    console.log('created product', product.id);
  } else {
    console.log('product exists', product.id);
  }

  // 2. Prices by lookup_key (idempotent)
  const existing = await stripeGet('/prices', {
    limit: 100,
    lookup_keys: PRICES.map((p) => p.lookup_key),
  });
  const byKey = new Map(existing.data.map((p) => [p.lookup_key, p]));
  for (const spec of PRICES) {
    if (byKey.has(spec.lookup_key)) {
      console.log('price exists', spec.lookup_key, byKey.get(spec.lookup_key).id);
      continue;
    }
    const price = await stripe('POST', '/prices', {
      product: product.id,
      currency: 'usd',
      unit_amount: spec.unit_amount,
      nickname: spec.nickname,
      lookup_key: spec.lookup_key,
      transfer_lookup_key: 'true',
      recurring: { interval: spec.interval, interval_count: spec.interval_count },
      metadata: { ieltsbank: 'premium', ppp: spec.lookup_key.endsWith('_ppp') ? '1' : '0' },
    });
    console.log('created price', spec.lookup_key, price.id);
  }

  // 3. 100%-off coupon + promotion code (E2E verification only; deactivate after)
  let coupon;
  try {
    coupon = await stripeGet('/coupons/E2E100');
    console.log('coupon exists', coupon.id);
  } catch {
    coupon = await stripe('POST', '/coupons', {
      id: 'E2E100',
      percent_off: 100,
      duration: 'forever',
      name: 'E2E verification (100% off)',
    });
    console.log('created coupon', coupon.id);
  }

  const promos = await stripeGet('/promotion_codes', { code: 'E2EVERIFY100', limit: 1 });
  if (promos.data.length) {
    console.log('promo code exists', promos.data[0].id, 'active:', promos.data[0].active);
  } else {
    const promo = await stripe('POST', '/promotion_codes', {
      promotion: { type: 'coupon', coupon: coupon.id },
      code: 'E2EVERIFY100',
      max_redemptions: 5,
    });
    console.log('created promo code', promo.id, promo.code);
  }

  console.log('catalog ready');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

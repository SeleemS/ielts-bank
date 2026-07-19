#!/usr/bin/env node
// Audits and, with --apply, idempotently configures the non-catalog Stripe
// objects required by docs/MONETIZATION-ACTION-PLAN-2026-07-18.md.
//
//   node scripts/configure-stripe-monetization.mjs
//   node scripts/configure-stripe-monetization.mjs --apply

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Stripe from 'stripe';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const WEBHOOK_URL = 'https://www.ielts-bank.com/api/webhooks/stripe';
const COUPON_ID = 'IELTSBANK_WINBACK40';
const PRODUCT_DESCRIPTION =
  'Daily fair-use AI Writing and Speaking scoring, AI examiner minutes, progress analytics, and ad-free practice.';
const REQUIRED_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
  'charge.refunded',
  'charge.dispute.created',
];

function loadEnvLocal() {
  const raw = readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function portalConfigurationSpec() {
  return {
    business_profile: {
      headline: 'Manage your IELTS Bank Premium plan',
      privacy_policy_url: 'https://www.ielts-bank.com/privacypolicy',
      terms_of_service_url: 'https://www.ielts-bank.com/termsofservice',
    },
    default_return_url: 'https://www.ielts-bank.com/billing/manage',
    features: {
      customer_update: { enabled: true, allowed_updates: ['email', 'tax_id'] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: 'at_period_end',
        cancellation_reason: {
          enabled: true,
          options: [
            'too_expensive',
            'missing_features',
            'switched_service',
            'unused',
            'low_quality',
            'other',
          ],
        },
      },
      subscription_update: { enabled: false },
    },
    metadata: { ielts_bank_managed: '1' },
  };
}

async function retrieveCoupon(stripe) {
  try {
    return await stripe.coupons.retrieve(COUPON_ID);
  } catch (error) {
    if (error?.code === 'resource_missing' || error?.statusCode === 404) return null;
    throw error;
  }
}

async function main() {
  const key = loadEnvLocal().STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY missing from .env.local');
  const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
  const changes = [];
  const missing = [];

  const products = await stripe.products.list({ active: true, limit: 100 });
  const product = products.data.find((item) => item.metadata?.ieltsbank === 'premium');
  if (!product) {
    throw new Error('IELTS Bank Premium product missing; run setup-stripe-catalog.mjs --apply first');
  }
  if (product.description !== PRODUCT_DESCRIPTION) {
    if (APPLY) {
      await stripe.products.update(product.id, { description: PRODUCT_DESCRIPTION });
      changes.push('product_description');
    } else {
      missing.push('product_description');
    }
  }

  const webhookEndpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const webhook = webhookEndpoints.data.find((item) => item.url === WEBHOOK_URL);
  if (!webhook) throw new Error(`production webhook missing: ${WEBHOOK_URL}`);
  if (webhook.status !== 'enabled') {
    missing.push(`webhook_status:${webhook.status}`);
  }
  const enabledEvents = webhook.enabled_events.includes('*')
    ? ['*']
    : [...new Set([...webhook.enabled_events, ...REQUIRED_EVENTS])].sort();
  const missingEvents = REQUIRED_EVENTS.filter(
    (event) => !webhook.enabled_events.includes('*') && !webhook.enabled_events.includes(event)
  );
  if (missingEvents.length) {
    if (APPLY) {
      await stripe.webhookEndpoints.update(webhook.id, { enabled_events: enabledEvents });
      changes.push(`webhook_events:${missingEvents.join(',')}`);
    } else {
      missing.push(...missingEvents.map((event) => `webhook_event:${event}`));
    }
  }
  const effectiveEnabledEvents =
    APPLY && missingEvents.length ? enabledEvents : webhook.enabled_events;

  let coupon = await retrieveCoupon(stripe);
  if (coupon) {
    if (coupon.percent_off !== 40 || coupon.duration !== 'once' || coupon.valid !== true) {
      throw new Error(`${COUPON_ID} exists but is not a valid single-use 40% coupon`);
    }
  } else if (APPLY) {
    coupon = await stripe.coupons.create({
      id: COUPON_ID,
      percent_off: 40,
      duration: 'once',
      name: 'IELTS Bank win-back — 40% off one month',
      metadata: { ieltsbank: 'winback', eligible_sku: 'monthly' },
    });
    changes.push('winback_coupon');
  } else {
    missing.push('winback_coupon');
  }

  const portalConfigurations = await stripe.billingPortal.configurations.list({
    active: true,
    limit: 100,
  });
  let portal = portalConfigurations.data.find(
    (configuration) => configuration.metadata?.ielts_bank_managed === '1'
  );
  if (!portal && APPLY) {
    portal = await stripe.billingPortal.configurations.create(portalConfigurationSpec());
    changes.push('billing_portal_configuration');
  } else if (!portal) {
    missing.push('billing_portal_configuration');
  }

  const tax = await stripe.tax.settings.retrieve();
  let radarApiAvailable = false;
  try {
    await stripe.radar.valueLists.list({ limit: 1 });
    radarApiAvailable = true;
  } catch {
    radarApiAvailable = false;
  }

  const result = {
    mode: APPLY ? 'apply' : 'audit',
    changes,
    missing,
    productId: product.id,
    webhookId: webhook.id,
    webhookStatus: webhook.status,
    enabledRequiredEvents: REQUIRED_EVENTS.filter(
      (event) =>
        effectiveEnabledEvents.includes('*') || effectiveEnabledEvents.includes(event)
    ),
    couponId: coupon?.id || null,
    portalConfigurationId: portal?.id || null,
    radarApiAvailable,
    taxStatus: tax.status,
    taxHeadOfficeSet: Boolean(tax.head_office),
  };
  console.log(JSON.stringify(result, null, 2));

  if (!APPLY && missing.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

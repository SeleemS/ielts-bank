// lib/billing.js
// Stripe billing core: price resolution (incl. server-side PPP), subscription
// state → users.plan mapping, and the webhook event handler. Route files stay
// thin; everything here is pure or dependency-injected so vitest can cover it.
// See docs/MONETIZATION.md §4 (Stripe), §5.3 (limits), §9.3 (realtime meter).

import Stripe from 'stripe';

// ---------------------------------------------------------------------------
// SKUs and PPP
// ---------------------------------------------------------------------------
export const SKUS = ['monthly', '6month', 'annual'];

const LOOKUP_BY_SKU = {
  monthly: 'premium_monthly',
  '6month': 'premium_6month',
  annual: 'premium_annual',
};

// India / MENA / SEA per docs/MONETIZATION.md §3.2 (~55% off list prices).
export const PPP_COUNTRIES = new Set([
  // South Asia
  'IN', 'PK', 'BD', 'LK', 'NP', 'BT', 'MV', 'AF',
  // Africa (major IELTS markets)
  'NG', 'EG', 'KE', 'GH', 'ET', 'MA', 'DZ', 'TN', 'SD', 'LY',
  // Middle East
  'JO', 'LB', 'PS', 'IQ', 'YE', 'SY', 'IR', 'SA', 'AE', 'QA', 'KW', 'BH', 'OM',
  // Southeast Asia
  'PH', 'VN', 'ID', 'TH', 'KH', 'MM', 'LA', 'MY',
  // Central Asia
  'UZ', 'KZ', 'KG', 'TJ', 'TM',
]);

// Realtime examiner allowance in seconds (§9.3): 60 min global, 30 min PPP.
export const REALTIME_SECONDS_GLOBAL = 3600;
export const REALTIME_SECONDS_PPP = 1800;

export function isPppCountry(countryCode) {
  return PPP_COUNTRIES.has(String(countryCode || '').toUpperCase());
}

export function resolveLookupKey(sku, countryCode) {
  const base = LOOKUP_BY_SKU[sku];
  if (!base) return null;
  return isPppCountry(countryCode) ? `${base}_ppp` : base;
}

// ---------------------------------------------------------------------------
// Stripe client (lazy singleton)
// ---------------------------------------------------------------------------
let _stripe = null;
export function getStripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('stripe-not-configured');
  _stripe = new Stripe(key);
  return _stripe;
}

// ---------------------------------------------------------------------------
// Subscription → users.* mapping
// ---------------------------------------------------------------------------

// Newer Stripe API versions moved current_period_end from the subscription to
// its items; support both shapes.
export function subscriptionPeriodEnd(sub) {
  const ts =
    sub?.current_period_end ||
    sub?.items?.data?.[0]?.current_period_end ||
    null;
  return ts ? new Date(ts * 1000).toISOString() : null;
}

export function subscriptionIsPpp(sub) {
  if (sub?.metadata?.ppp === '1') return true;
  const lookup = sub?.items?.data?.[0]?.price?.lookup_key || '';
  return lookup.endsWith('_ppp');
}

// Map a Stripe subscription object to the users-table billing fields.
export function mapSubscriptionToPlanFields(sub) {
  const renewsAt = subscriptionPeriodEnd(sub);
  const base = {
    stripe_customer_id:
      typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || null,
    stripe_subscription_id: sub.id,
    plan_renews_at: renewsAt,
  };
  switch (sub.status) {
    case 'active':
    case 'trialing':
      return {
        ...base,
        plan: 'premium',
        // cancel_at_period_end => access persists to period end, no renewal
        plan_status: sub.cancel_at_period_end ? 'canceled' : sub.status === 'trialing' ? 'trialing' : 'active',
      };
    case 'past_due':
      return { ...base, plan: 'premium', plan_status: 'past_due' };
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return { ...base, plan: 'free', plan_status: 'canceled' };
    default:
      // incomplete / paused: not entitled yet
      return { ...base, plan: 'free', plan_status: 'inactive' };
  }
}

// ---------------------------------------------------------------------------
// Webhook event handling (idempotent: pure state upserts keyed on user row)
// deps = { admin: supabase service-role client, stripe }
// Returns a short string describing what happened (for logs/tests).
// ---------------------------------------------------------------------------

async function findUserId(admin, { userId, customerId, subscriptionId }) {
  if (userId) return userId;
  if (subscriptionId) {
    const { data } = await admin
      .from('users')
      .select('id')
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  if (customerId) {
    const { data } = await admin
      .from('users')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

async function applyPlanFields(admin, userId, fields) {
  const { error } = await admin.from('users').update(fields).eq('id', userId);
  if (error) throw new Error(`users update failed: ${error.message}`);
}

async function seedRealtimeQuota(admin, userId, isPpp) {
  const quota = isPpp ? REALTIME_SECONDS_PPP : REALTIME_SECONDS_GLOBAL;
  const { error } = await admin
    .from('user_quotas')
    .update({
      realtime_seconds_quota: quota,
      realtime_seconds_remaining: quota,
      realtime_period_resets_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    })
    .eq('user_id', userId);
  if (error) throw new Error(`user_quotas update failed: ${error.message}`);
}

async function revokeRealtimeQuota(admin, userId) {
  const { error } = await admin
    .from('user_quotas')
    .update({ realtime_seconds_quota: 0, realtime_seconds_remaining: 0 })
    .eq('user_id', userId);
  if (error) throw new Error(`user_quotas update failed: ${error.message}`);
}

export async function handleStripeEvent(event, { admin, stripe }) {
  const obj = event.data?.object || {};

  switch (event.type) {
    case 'checkout.session.completed': {
      if (obj.mode !== 'subscription' || !obj.subscription) return 'ignored: not a subscription checkout';
      const sub =
        typeof obj.subscription === 'string'
          ? await stripe.subscriptions.retrieve(obj.subscription)
          : obj.subscription;
      const userId = await findUserId(admin, {
        userId: obj.client_reference_id || sub.metadata?.user_id,
        customerId: typeof obj.customer === 'string' ? obj.customer : obj.customer?.id,
      });
      if (!userId) return 'error: no user mapping for checkout.session.completed';
      const fields = mapSubscriptionToPlanFields(sub);
      await applyPlanFields(admin, userId, { ...fields, plan_started_at: new Date().toISOString() });
      if (fields.plan === 'premium') await seedRealtimeQuota(admin, userId, subscriptionIsPpp(sub));
      return `activated user ${userId} (${fields.plan_status})`;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const userId = await findUserId(admin, {
        userId: obj.metadata?.user_id,
        subscriptionId: obj.id,
        customerId: typeof obj.customer === 'string' ? obj.customer : obj.customer?.id,
      });
      if (!userId) return 'ignored: no user mapping for subscription event';
      const fields = mapSubscriptionToPlanFields(obj);
      await applyPlanFields(admin, userId, fields);
      if (fields.plan === 'free') await revokeRealtimeQuota(admin, userId);
      return `synced user ${userId} -> ${fields.plan}/${fields.plan_status}`;
    }

    case 'customer.subscription.deleted': {
      const userId = await findUserId(admin, {
        userId: obj.metadata?.user_id,
        subscriptionId: obj.id,
        customerId: typeof obj.customer === 'string' ? obj.customer : obj.customer?.id,
      });
      if (!userId) return 'ignored: no user mapping for subscription.deleted';
      await applyPlanFields(admin, userId, {
        plan: 'free',
        plan_status: 'canceled',
        plan_renews_at: subscriptionPeriodEnd(obj),
      });
      await revokeRealtimeQuota(admin, userId);
      return `downgraded user ${userId}`;
    }

    case 'invoice.payment_failed': {
      const userId = await findUserId(admin, {
        customerId: typeof obj.customer === 'string' ? obj.customer : obj.customer?.id,
      });
      if (!userId) return 'ignored: no user mapping for payment_failed';
      await applyPlanFields(admin, userId, { plan_status: 'past_due' });
      return `past_due user ${userId}`;
    }

    case 'charge.refunded':
    case 'charge.dispute.created': {
      const customerId =
        typeof obj.customer === 'string' ? obj.customer : obj.customer?.id;
      const userId = await findUserId(admin, { customerId });
      if (!userId) return 'ignored: no user mapping for refund/dispute';
      await applyPlanFields(admin, userId, { plan: 'free', plan_status: 'refunded' });
      await revokeRealtimeQuota(admin, userId);
      return `refunded user ${userId}`;
    }

    default:
      return `ignored: ${event.type}`;
  }
}

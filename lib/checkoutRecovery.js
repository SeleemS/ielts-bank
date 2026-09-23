// lib/checkoutRecovery.js
// Abandoned-checkout recovery (growth sprint Sep 23, monetization action #3).
//
//   1. Checkout Sessions expire after CHECKOUT_EXPIRY_SECONDS (3h, not
//      Stripe's 24h default) with after_expiration.recovery enabled, so Stripe
//      attaches a 30-day recovery URL to the expired session.
//   2. The webhook's checkout.session.expired branch (lib/billing.js) records
//      `checkout_expired` and queues ONE existing `checkout_abandoned`
//      lifecycle email carrying that URL (queueCheckoutRecoveryEmail below).
//      The URL is stored only in lifecycle_emails.payload (service-role only),
//      never in analytics rows: it opens a checkout prefilled with the
//      learner's email.
//   3. A session completed from that URL has `recovered_from`; the webhook
//      records `checkout_recovered`.
//
// Consent: the email is the existing checkout_abandoned type, so the delivery
// cron applies the same study-plan preference gate and one-click unsubscribe
// as before (lib/emailPrefs.js). At most one per learner per 7 days, never to
// someone who already has Pro. No new table or column is needed.

import { isPremiumRow } from './premium';

export const CHECKOUT_EXPIRY_SECONDS = 3 * 60 * 60;
export const RECOVERY_EMAIL_COOLDOWN_DAYS = 7;
const DAY_MS = 86400000;

// Both parameters are valid for `payment` (Exam Pass) and `subscription`
// sessions on the hosted page (Stripe API 2026-06-24: after_expiration is only
// refused for ui_mode=elements; expires_at must be 30 min – 24 h after
// creation). Recovered sessions follow the same promotion-code rule as the
// original: no user codes when a coupon is already attached.
export function checkoutExpiryParams({ nowMs = Date.now(), allowPromotionCodes = true } = {}) {
  return {
    expires_at: Math.floor(nowMs / 1000) + CHECKOUT_EXPIRY_SECONDS,
    after_expiration: {
      recovery: { enabled: true, allow_promotion_codes: Boolean(allowPromotionCodes) },
    },
  };
}

// Only ever link to Stripe-hosted HTTPS pages from an email.
export function safeRecoveryUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host !== 'stripe.com' && !host.endsWith('.stripe.com')) return null;
  return url.toString();
}

// The recovery link to render, or null once it has expired or is unsafe.
export function liveRecoveryUrl(payload, nowMs = Date.now()) {
  const url = safeRecoveryUrl(payload?.recovery_url);
  if (!url) return null;
  const expiresAt = Date.parse(payload?.recovery_expires_at || '');
  if (Number.isFinite(expiresAt) && expiresAt <= nowMs) return null;
  return url;
}

function utcDateKey(date) {
  return date.toISOString().slice(0, 10);
}

// Queue the recovery email for an expired session. Returns a short status for
// webhook logs. Never throws: the durable `checkout_expired` record is written
// by the caller first, and a failed email must not make Stripe retry forever.
export async function queueCheckoutRecoveryEmail(admin, userId, {
  sessionId,
  sessionCreated,
  recoveryUrl,
  recoveryExpiresAt = null,
  sku = null,
  upgrade = '',
  now = new Date(),
}) {
  const url = safeRecoveryUrl(recoveryUrl);
  if (!url) return 'recovery email skipped (no recovery url)';
  try {
    const { data: user, error: userError } = await admin
      .from('users')
      .select('email, plan, plan_status, plan_renews_at, plan_expires_at, billing_pause_until')
      .eq('id', userId)
      .maybeSingle();
    if (userError) throw userError;
    if (!user?.email) return 'recovery email skipped (no email)';
    if (isPremiumRow(user, now.getTime())) return 'recovery email skipped (already premium)';

    const since = new Date(now.getTime() - RECOVERY_EMAIL_COOLDOWN_DAYS * DAY_MS).toISOString();
    const { data: recent, error: recentError } = await admin
      .from('lifecycle_emails')
      .select('id')
      .eq('user_id', userId)
      .eq('email_type', 'checkout_abandoned')
      .gte('created_at', since)
      .limit(1);
    if (recentError) throw recentError;
    if (recent?.length) return 'recovery email skipped (sent within 7 days)';

    const created = Number.isFinite(sessionCreated) && sessionCreated > 0
      ? new Date(sessionCreated * 1000)
      : now;
    const { error } = await admin.from('lifecycle_emails').insert({
      user_id: userId,
      recipient_email: String(user.email).toLowerCase(),
      email_type: 'checkout_abandoned',
      // Same key shape as the cron fallback, so the two can never both send.
      idempotency_key: `checkout_abandoned:${userId}:${utcDateKey(created)}`,
      payload: {
        upgrade: ['writing', 'speaking', 'mock'].includes(upgrade) ? upgrade : '',
        sku: ['monthly', 'annual', 'exam_pass'].includes(sku) ? sku : null,
        session_id: sessionId || null,
        recovery_url: url,
        recovery_expires_at: recoveryExpiresAt,
      },
    });
    if (error && error.code !== '23505') throw error;
    return error ? 'recovery email already queued' : 'recovery email queued';
  } catch (error) {
    console.error('checkout recovery email not queued:', error?.message || error);
    return 'recovery email failed';
  }
}

// Upgrade context ("writing" / "speaking" / "mock") travels in the success
// URL, which the expired session still carries.
export function upgradeFromSession(session) {
  try {
    const upgrade = new URL(session?.success_url || '').searchParams.get('upgrade');
    return ['writing', 'speaking', 'mock'].includes(upgrade) ? upgrade : '';
  } catch {
    return '';
  }
}

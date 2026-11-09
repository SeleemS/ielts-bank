// lib/reportUnlock.js
// Single Writing report unlock: one payment opens ONE saved report in full.
// It never touches the user's plan — the only thing it writes is
// writing_reports.unlocked_at, the same column an active Pro plan sets when a
// subscriber opens a saved report (pages/api/writing-reports/[id].js).
//
// Used by the checkout route (pages/api/billing/report-unlock.js) and by the
// Stripe webhook (lib/billing.js), so a purchase unlocks whether the buyer
// returns to the site or not.
import { REPORT_ID_RE } from './writingReport';

export const REPORT_UNLOCK_SKU = 'report_unlock';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isReportUnlockSession(session) {
  return session?.mode === 'payment' && session?.metadata?.sku === REPORT_UNLOCK_SKU;
}

// Paid in full, or a confirmed zero total (100%-off promotion code). Never an
// unpaid or still-processing order.
export function reportUnlockSettled(session) {
  return session?.payment_status === 'paid'
    || (session?.payment_status === 'no_payment_required' && session?.amount_total === 0);
}

// Who bought which report, taken only from values the server stamped on the
// session at creation. Null when either is missing or malformed.
export function reportUnlockTarget(session) {
  const userId = session?.client_reference_id || session?.metadata?.user_id || '';
  const reportId = session?.metadata?.report_id || '';
  if (!UUID_RE.test(userId) || !REPORT_ID_RE.test(reportId)) return null;
  return { userId, reportId };
}

// Open the report. Idempotent: only the first call writes; later calls (webhook
// retries, the buyer's return) report 'already_unlocked'.
//   'unlocked' | 'already_unlocked' | 'not_found'
export async function unlockReport(admin, { userId, reportId }, now = new Date()) {
  const update = await admin.from('writing_reports')
    .update({ unlocked_at: now.toISOString() })
    .eq('attempt_id', reportId).eq('user_id', userId).is('unlocked_at', null)
    .select('attempt_id');
  if (update.error) throw new Error(`report unlock failed: ${update.error.message}`);
  if (Array.isArray(update.data) && update.data.length > 0) return 'unlocked';
  const existing = await admin.from('writing_reports').select('attempt_id, unlocked_at')
    .eq('attempt_id', reportId).eq('user_id', userId).maybeSingle();
  if (existing.error) throw new Error(`report unlock lookup failed: ${existing.error.message}`);
  return existing.data ? 'already_unlocked' : 'not_found';
}

// A refunded or disputed unlock closes the report again.
export async function relockReport(admin, { userId, reportId }) {
  const update = await admin.from('writing_reports')
    .update({ unlocked_at: null })
    .eq('attempt_id', reportId).eq('user_id', userId);
  if (update.error) throw new Error(`report relock failed: ${update.error.message}`);
}

// The report-unlock Checkout Session behind a charge, or null when the charge
// belongs to something else (a pass or a subscription invoice).
export async function reportUnlockSessionForCharge(charge, stripe) {
  const paymentIntentId = typeof charge?.payment_intent === 'string'
    ? charge.payment_intent : charge?.payment_intent?.id || null;
  if (!paymentIntentId) return null;
  const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 2 });
  const matches = (sessions?.data || []).filter(isReportUnlockSession);
  return matches.length === 1 ? matches[0] : null;
}

// pages/api/billing/report-unlock.js
// One payment opens ONE saved Writing report in full (lib/reportUnlock.js).
//
//   POST { reportId }                 -> { url }       open Stripe Checkout
//   POST { reportId, sessionId }      -> { unlocked }  the buyer came back:
//                                        confirm with Stripe and open the
//                                        report now instead of waiting for the
//                                        webhook (both paths are idempotent).
//
//   * signed-in, non-anonymous owner of the report only;
//   * the amount comes from saleConfig's REPORT_UNLOCK and the request geo
//     (x-vercel-ip-country), never from the client;
//   * Pro members are turned away — their plan already opens every report;
//   * nothing here changes the user's plan.
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { clientIp, originAllowed } from '../../../lib/apiSecurity';
import { completeReportUnlock, getStripe, isPppCountry } from '../../../lib/billing';
import { isPremiumRow } from '../../../lib/premium';
import { REPORT_UNLOCK_SKU, isReportUnlockSession, reportUnlockTarget } from '../../../lib/reportUnlock';
import { REPORT_ID_RE } from '../../../lib/writingReport';
import { sanitizeGaClientId } from '../../../lib/ga4mp';
import { REPORT_UNLOCK, reportUnlockEnabled, reportUnlockPrice } from '../../../src/lib/saleConfig';

const WINDOW_SECONDS = 10 * 60;
const MAX_PER_WINDOW = 10;
const SESSION_ID_RE = /^cs_[A-Za-z0-9_]{1,200}$/;

let _admin = null;
function getAdmin() {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-admin-not-configured');
  _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _admin;
}

function siteOrigin(req) {
  if (process.env.NODE_ENV !== 'production') {
    const origin = req.headers.origin;
    if (typeof origin === 'string' && origin.startsWith('http://localhost')) return origin;
  }
  return 'https://www.ielts-bank.com';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!originAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  if (!reportUnlockEnabled()) return res.status(404).json({ error: 'Not available.' });

  const token = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || '').trim())?.[1];
  if (!token) return res.status(401).json({ error: 'Sign in to unlock your report.' });
  const reportId = req.body?.reportId;
  if (typeof reportId !== 'string' || !REPORT_ID_RE.test(reportId)) {
    return res.status(400).json({ error: 'Invalid report.' });
  }
  const sessionId = req.body?.sessionId;
  if (sessionId != null && (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId))) {
    return res.status(400).json({ error: 'Invalid checkout.' });
  }

  let admin;
  let user;
  let userRow;
  let report;
  try {
    admin = getAdmin();
    const auth = await admin.auth.getUser(token.trim());
    user = auth.data?.user;
    if (auth.error || !user?.email || user.is_anonymous) {
      return res.status(401).json({ error: 'Sign in to unlock your report.' });
    }
    const [userResult, reportResult] = await Promise.all([
      admin.from('users')
        .select('id, email, stripe_customer_id, plan, plan_status, plan_renews_at, plan_expires_at, billing_pause_until')
        .eq('id', user.id).maybeSingle(),
      admin.from('writing_reports').select('attempt_id, unlocked_at')
        .eq('attempt_id', reportId).eq('user_id', user.id).maybeSingle(),
    ]);
    if (userResult.error) throw userResult.error;
    if (reportResult.error) throw reportResult.error;
    userRow = userResult.data;
    report = reportResult.data;
  } catch (error) {
    console.error('report unlock lookup error:', error.message);
    return res.status(503).json({ error: 'Could not verify your report. Please try again.' });
  }
  if (!userRow) return res.status(401).json({ error: 'Sign in to unlock your report.' });
  // Do not disclose whether another account owns this ID.
  if (!report) return res.status(404).json({ error: 'Report not found in this account.', code: 'report_not_found' });
  if (report.unlocked_at) return res.status(200).json({ unlocked: true });

  // The buyer's return from Stripe: confirm this exact session and open the
  // report. The session must be a paid report unlock stamped for THIS user and
  // THIS report; anything else is refused.
  if (sessionId) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      const target = isReportUnlockSession(session) ? reportUnlockTarget(session) : null;
      if (!target || target.userId !== user.id || target.reportId !== reportId) {
        return res.status(403).json({ error: 'This payment does not match this report.' });
      }
      const outcome = await completeReportUnlock(admin, session);
      return res.status(200).json({ unlocked: outcome.startsWith('unlocked') });
    } catch (error) {
      console.error('report unlock confirm error:', error.message);
      return res.status(503).json({ error: 'Could not confirm your payment yet. Refresh in a moment.' });
    }
  }

  if (isPremiumRow(userRow)) {
    return res.status(409).json({
      error: 'Your plan already includes this report. Open it to see the full feedback.',
      code: 'already_pro',
    });
  }

  try {
    const { data: allowed, error } = await admin.rpc('check_rate_limit', {
      p_bucket: 'billing-checkout',
      p_identifier: userRow.id,
      p_window_seconds: WINDOW_SECONDS,
      p_max: MAX_PER_WINDOW,
    });
    if (error) throw error;
    if (!allowed) {
      return res.status(429).json({ error: 'Too many checkout attempts. Please wait a few minutes and try again.' });
    }
  } catch (error) {
    console.error('report unlock rate-limit error:', error.message);
    return res.status(503).json({ error: 'Could not start checkout. Please try again.' });
  }

  const country = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  const ppp = isPppCountry(country);
  const unitAmount = Math.round(reportUnlockPrice(ppp) * 100);
  const origin = siteOrigin(req);
  const reportUrl = `${origin}/writing-report/${reportId}`;
  const gaCid = sanitizeGaClientId(req.body?.ga_cid);
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      ...(userRow.stripe_customer_id
        ? { customer: userRow.stripe_customer_id }
        : { customer_email: userRow.email }),
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: unitAmount,
          product_data: {
            name: REPORT_UNLOCK.name,
            description: 'Full feedback on one saved IELTS Writing report: all four criteria, every correction and the Band 8 rewrite. One payment, never renews.',
          },
        },
      }],
      allow_promotion_codes: true,
      client_reference_id: userRow.id,
      metadata: {
        user_id: userRow.id,
        sku: REPORT_UNLOCK_SKU,
        report_id: reportId,
        ppp: ppp ? '1' : '0',
        ...(gaCid ? { ga_cid: gaCid } : {}),
      },
      ...(process.env.STRIPE_AUTOMATIC_TAX === '1' ? { automatic_tax: { enabled: true } } : {}),
      success_url: `${reportUrl}?unlock=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${reportUrl}?unlock=canceled`,
    });
    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('report unlock checkout error:', error.message, 'ip:', clientIp(req));
    return res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }
}

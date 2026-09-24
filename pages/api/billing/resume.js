// pages/api/billing/resume.js
// POST { c: <resume token>, ga_cid? } with the learner's Bearer token.
// Backs /billing/resume, the page the checkout recovery email links to.
//
//   1. The learner must be signed in (401 sign_in_required otherwise) as the
//      account the email was sent to (403 wrong_user).
//   2. lib/checkoutResume.resolveResume re-runs the shared checkout guards
//      (lib/checkoutEligibility) and the resume-only checks (lapsed link,
//      plan retired, discount ended). A refusal answers { outcome, redirect }.
//   3. Otherwise the request is handed to the NORMAL checkout handler
//      (pages/api/billing/checkout.js) for the same plan, which re-checks
//      everything (rate limit, price contract, promo coupon, guards) and opens
//      a brand-new Checkout Session. Stripe's recovery URL is never used.
//
// Every attempt is recorded as `checkout_resume` with its outcome.
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { originAllowed } from '../../../lib/apiSecurity';
import { BILLING_USER_COLUMNS } from '../../../lib/checkoutEligibility';
import { isResumeToken } from '../../../lib/checkoutRecovery';
import { findResumeRow, recordCheckoutResume, resolveResume } from '../../../lib/checkoutResume';
import checkoutHandler from './checkout';

let _admin = null;
function getAdmin() {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-admin-not-configured');
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

async function resolveUser(req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || '').trim());
  if (!match) return { user: null, error: null };
  try {
    const { data, error } = await getAdmin().auth.getUser(match[1].trim());
    if (error || !data?.user) return { user: null, error: null };
    return { user: data.user, error: null };
  } catch (error) {
    return { user: null, error };
  }
}

const FALLBACK = '/pricing?resume=unavailable';

const MESSAGES = {
  wrong_user: 'This checkout link belongs to a different IELTS Bank account. Sign in with the account you used at checkout.',
  anonymous_user: 'Sign in with the email account you used at checkout to continue.',
};

// Collects the checkout handler's answer without sending it, so the outcome
// can be recorded before the response leaves (work after a response is sent
// is not guaranteed to run on serverless).
function captureResponse(res) {
  const captured = { status: 200, body: null };
  const proxy = {
    status(code) {
      captured.status = code;
      return proxy;
    },
    json(body) {
      captured.body = body;
      return proxy;
    },
    setHeader(name, value) {
      res.setHeader(name, value);
    },
  };
  return { proxy, captured };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!originAllowed(req)) return res.status(403).json({ error: 'Forbidden' });

  const token = req.body?.c;
  if (!isResumeToken(token)) {
    return res.status(400).json({ outcome: 'not_found', redirect: FALLBACK });
  }

  const { user: authUser, error: authError } = await resolveUser(req);
  if (authError) {
    console.error('checkout resume auth lookup error:', authError.message);
    return res.status(503).json({ error: 'Could not verify your account. Please try again.' });
  }
  if (!authUser) {
    return res.status(401).json({ outcome: 'sign_in_required', error: 'Sign in to finish your checkout.' });
  }

  const admin = getAdmin();
  let row;
  let userRow;
  try {
    row = await findResumeRow(admin, token);
    const { data, error } = await admin
      .from('users')
      .select(BILLING_USER_COLUMNS)
      .eq('id', authUser.id)
      .maybeSingle();
    if (error) throw error;
    userRow = data;
  } catch (error) {
    console.error('checkout resume lookup error:', error?.message || error);
    return res.status(503).json({ error: 'Could not load your checkout. Please try again.' });
  }

  const decision = resolveResume({ row, userId: authUser.id, userRow });
  const originalSessionId = decision.outcome === 'wrong_user' ? null : row?.payload?.session_id || null;
  if (!decision.ok) {
    await recordCheckoutResume(admin, {
      userId: authUser.id, outcome: decision.outcome, sku: decision.sku, originalSessionId,
    });
    const status = decision.outcome === 'wrong_user' || decision.outcome === 'anonymous_user' ? 403 : 409;
    return res.status(status).json({
      outcome: decision.outcome,
      redirect: decision.redirect,
      ...(MESSAGES[decision.outcome] ? { error: MESSAGES[decision.outcome] } : {}),
    });
  }

  // Same plan, same upgrade context, through the normal checkout path. The
  // original session id rides on a request property (never the body), so it
  // can only be set here; checkout stamps it as metadata.resumed_from.
  req.body = {
    sku: decision.sku,
    ...(decision.offer ? { offer: decision.offer } : {}),
    ...(typeof req.body?.ga_cid === 'string' ? { ga_cid: req.body.ga_cid } : {}),
    ...(typeof req.body?.ga_sid === 'string' ? { ga_sid: req.body.ga_sid } : {}),
    ...decision.context,
  };
  req.checkoutResume = { sessionId: decision.sessionId };
  const { proxy, captured } = captureResponse(res);
  await checkoutHandler(req, proxy);

  const created = captured.status === 200 && typeof captured.body?.url === 'string';
  await recordCheckoutResume(admin, {
    userId: authUser.id,
    outcome: created ? 'new_session' : 'checkout_refused',
    sku: decision.sku,
    originalSessionId,
    httpStatus: created ? null : captured.status,
    code: created ? null : captured.body?.code,
  });
  if (created) return res.status(200).json({ outcome: 'new_session', url: captured.body.url });
  // A guard that tripped between our check and session creation (e.g. a
  // purchase completed in another tab) still gets a friendly destination.
  const code = captured.body?.code;
  const redirect = code === 'already_premium' || code === 'already_exam_pass'
    ? `/dashboard?resume=${code}`
    : null;
  return res.status(captured.status || 500).json({
    ...(captured.body || {}),
    outcome: 'checkout_refused',
    ...(redirect ? { redirect } : {}),
  });
}

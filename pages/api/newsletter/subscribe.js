// pages/api/newsletter/subscribe.js
// Email capture for the marketing newsletter. Mirrors the security posture of
// pages/api/score/writing.js:
//   * runs only on the server (needs the Supabase service-role key),
//   * rate-limits per client IP via the check_rate_limit() RPC (bucket
//     'newsletter', ~10/day per IP) to blunt spam/abuse,
//   * inserts through the service-role client (bypasses RLS on
//     newsletter_subscribers) with ON CONFLICT (email) DO NOTHING,
//   * ALWAYS returns {ok:true} for a validly-formatted email so the subscriber
//     list can never be enumerated (no "already subscribed" signal).
//
// pages/api/* run on the Node.js runtime by default, which is what we need.
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

// Per-IP allowance: 10 subscribe attempts per rolling day.
const PER_IP_WINDOW_SECONDS = 86400;
const PER_IP_MAX = 10;

const MAX_EMAIL_LENGTH = 320;
// Pragmatic email shape check (not a full RFC 5322 validator — the DB unique
// constraint + downstream double opt-in are the real guards).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ALLOWED_ORIGINS = [
  'https://ielts-bank.com',
  'https://www.ielts-bank.com',
  'http://localhost:3000',
  'http://localhost:3025',
];

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

// Returns true if still within allowance, false if over the limit. On DB error
// we FAIL OPEN for availability (a transient RPC error should not block a
// legitimate subscribe); the unique constraint still prevents duplicates.
async function withinLimit(bucket, identifier, windowSeconds, max) {
  const { data, error } = await getAdmin().rpc('check_rate_limit', {
    p_bucket: bucket,
    p_identifier: identifier,
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  if (error) {
    console.error('check_rate_limit error:', error.message);
    return true;
  }
  return data === true;
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) {
    return xff.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function originAllowed(req) {
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  if (!origin && !referer) {
    return process.env.NODE_ENV !== 'production';
  }
  const candidate = origin || referer;
  return ALLOWED_ORIGINS.some((allowed) => candidate.startsWith(allowed));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!originAllowed(req)) {
    return res
      .status(403)
      .json({ error: 'Requests from this origin are not allowed.' });
  }

  const body = req.body || {};
  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const source =
    typeof body.source === 'string' ? body.source.trim().slice(0, 120) : null;

  // Reject malformed input with a real error (this is not a subscriber-existence
  // signal, so it is safe to distinguish an invalid address).
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  // Abuse protection before touching the table.
  try {
    const ok = await withinLimit(
      'newsletter',
      clientIp(req),
      PER_IP_WINDOW_SECONDS,
      PER_IP_MAX
    );
    if (!ok) {
      return res.status(429).json({
        error: 'Too many sign-up attempts. Please try again later.',
      });
    }
  } catch (e) {
    console.error('newsletter rate-limit check failed:', e.message);
    // Rate-limit infra misconfigured: fail closed to avoid unbounded writes.
    return res
      .status(503)
      .json({ error: 'Sign-up is temporarily unavailable. Please try again later.' });
  }

  // Insert. ON CONFLICT (email) DO NOTHING means a repeat subscribe is a no-op.
  // We deliberately do NOT surface whether the row already existed.
  try {
    const { error } = await getAdmin()
      .from('newsletter_subscribers')
      .upsert({ email, source }, { onConflict: 'email', ignoreDuplicates: true });

    if (error) {
      console.error('newsletter insert failed:', error.message);
      return res
        .status(502)
        .json({ error: 'Could not complete your sign-up. Please try again.' });
    }
  } catch (e) {
    console.error('newsletter insert error:', e.message);
    return res
      .status(502)
      .json({ error: 'Could not complete your sign-up. Please try again.' });
  }

  // No enumeration: any validly-formatted email that got this far succeeds.
  return res.status(200).json({ ok: true });
}

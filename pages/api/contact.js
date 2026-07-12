// pages/api/contact.js
// Receives Contact Us form submissions and persists them to public.contact_messages
// via the server-side service-role Supabase client (bypasses RLS; the table has
// no anon policies — see supabase/migrations/0011_contact_messages.sql).
//
// This route mirrors the security pattern of pages/api/score/writing.js:
//   * runs only on the server (needs SUPABASE_SERVICE_ROLE_KEY),
//   * POST only,
//   * checks Origin/Referer against an allow-list,
//   * rate-limits per client IP via the Supabase check_rate_limit() RPC
//     (0008_rate_limits.sql) using a dedicated 'contact' bucket (~5/day/IP),
//   * validates {name,email,message} lengths + a basic email regex.
//
// pages/api/* run on the Node.js runtime by default, which is what we need.
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const NAME_MAX = 200;
const EMAIL_MAX = 320;
const MESSAGE_MAX = 5000;
const MESSAGE_MIN = 1;

// Basic, permissive email shape check (defence-in-depth; not full RFC 5322).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CONTACT_WINDOW_SECONDS = 86400; // 1 day
const CONTACT_MAX = 5; // 5 submissions / day / IP

// Allowed browser origins (same list as the scoring routes).
const ALLOWED_ORIGINS = [
  'https://ielts-bank.com',
  'https://www.ielts-bank.com',
  'http://localhost:3000',
  'http://localhost:3025',
];

// ---------------------------------------------------------------------------
// Supabase service-role client (server-only; bypasses RLS for contact_messages)
// ---------------------------------------------------------------------------
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

// Returns true if still within allowance, false if over the limit. Unlike the
// scoring route (which fails OPEN for availability), a contact-form flood is
// pure abuse, so on a rate-limit infra error we FAIL CLOSED.
async function withinLimit(bucket, identifier, windowSeconds, max) {
  const { data, error } = await getAdmin().rpc('check_rate_limit', {
    p_bucket: bucket,
    p_identifier: identifier,
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  if (error) throw new Error(error.message);
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

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
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

  // --- Validate body -------------------------------------------------------
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!name || name.length > NAME_MAX) {
    return res
      .status(400)
      .json({ error: 'Please enter your name (up to 200 characters).' });
  }
  if (!email || email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) {
    return res
      .status(400)
      .json({ error: 'Please enter a message (up to 5000 characters).' });
  }

  // --- Rate limit (per IP) BEFORE writing ----------------------------------
  try {
    const ip = clientIp(req);
    const ok = await withinLimit('contact', ip, CONTACT_WINDOW_SECONDS, CONTACT_MAX);
    if (!ok) {
      return res.status(429).json({
        error:
          'You have sent several messages already. Please try again tomorrow or email us directly.',
      });
    }
  } catch (e) {
    console.error('contact rate-limit check failed:', e.message);
    return res
      .status(503)
      .json({ error: 'The contact form is temporarily unavailable. Please try again later.' });
  }

  // --- Persist -------------------------------------------------------------
  try {
    const { error } = await getAdmin()
      .from('contact_messages')
      .insert({ name, email, message });
    if (error) {
      console.error('contact insert failed:', error.message);
      return res
        .status(502)
        .json({ error: 'We could not send your message. Please try again later.' });
    }
  } catch (e) {
    console.error('contact handler error:', e.message);
    return res
      .status(502)
      .json({ error: 'We could not send your message. Please try again later.' });
  }

  return res.status(200).json({ ok: true });
}

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
import { clientIp, originAllowed } from '../../lib/apiSecurity';

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

// ---------------------------------------------------------------------------
// Email notification (Resend). The destination address lives ONLY in server
// env (CONTACT_EMAIL, falling back to REPORT_EMAIL) — it is never rendered
// client-side. Reply-To is set to the visitor so replying goes straight to
// them. Fail-soft: the message is already persisted, so an email hiccup must
// not fail the submission; it is logged instead.
// ---------------------------------------------------------------------------
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function notifyByEmail({ name, email, message }) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_EMAIL || process.env.REPORT_EMAIL;
  if (!apiKey || !to) return { sent: false, reason: 'email-not-configured' };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || process.env.REPORT_FROM || 'IELTS Bank <hello@ielts-bank.com>',
      to: [to],
      reply_to: email,
      subject: `Contact form: ${name}`,
      html: `
        <h2 style="font-size:16px;margin:0 0 12px">New contact message — ielts-bank.com</h2>
        <p style="margin:0 0 4px"><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
        <p style="margin:0 0 12px;color:#64748b;font-size:13px">Reply to this email to answer them directly.</p>
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;white-space:pre-wrap;font-size:14px;line-height:1.6">${escapeHtml(message)}</div>
      `,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return { sent: false, reason: `resend-${response.status}: ${detail.slice(0, 200)}` };
  }
  return { sent: true };
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
        error: 'You have sent several messages already. Please try again tomorrow.',
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

  // --- Notify (fail-soft: message is already saved) ------------------------
  try {
    const result = await notifyByEmail({ name, email, message });
    if (!result.sent) console.error('contact email not sent:', result.reason);
  } catch (e) {
    console.error('contact email error:', e.message);
  }

  return res.status(200).json({ ok: true });
}

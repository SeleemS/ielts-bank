export const config = { runtime: 'nodejs' };

// Session login/logout for the private /data dashboard. Brute force is
// blunted by the shared check_rate_limit RPC (per-IP, 10 tries / 5 min).

import { createClient } from '@supabase/supabase-js';
import { clientIp, originAllowed } from '../../../lib/apiSecurity';
import {
  clearSessionCookie,
  dashConfigured,
  issueToken,
  passwordMatches,
  sessionCookie,
  setPrivateHeaders,
} from '../../../lib/dataDashAuth';

let adminClient = null;
function admin() {
  if (adminClient) return adminClient;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-admin-not-configured');
  adminClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return adminClient;
}

export default async function handler(req, res) {
  setPrivateHeaders(res);

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', clearSessionCookie());
    return res.status(200).json({ ok: true });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!originAllowed(req)) return res.status(403).json({ error: 'Origin not allowed.' });
  if (!dashConfigured()) {
    return res.status(503).json({ error: 'Dashboard is not configured.' });
  }

  try {
    const { data: allowed, error } = await admin().rpc('check_rate_limit', {
      p_bucket: 'data-dash-login',
      p_identifier: clientIp(req),
      p_window_seconds: 300,
      p_max: 10,
    });
    if (error) throw error;
    if (allowed !== true) return res.status(429).json({ error: 'Too many attempts. Try later.' });
  } catch (error) {
    console.error('data-dash login rate limit failed:', error.message);
    return res.status(503).json({ error: 'Login unavailable.' });
  }

  if (!passwordMatches(req.body?.password)) {
    return res.status(401).json({ error: 'Wrong password.' });
  }

  res.setHeader('Set-Cookie', sessionCookie(issueToken()));
  return res.status(200).json({ ok: true });
}

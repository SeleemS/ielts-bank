// pages/api/live/session/end.js
// Ends a Live examiner session. The browser's `session.close` on the data
// channel is best effort — a closed laptop lid never sends it — so the
// server-side hangup here is the authoritative stop on a meter that bills
// every second, silence included.
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { originAllowed } from '../../../../lib/apiSecurity';
import { liveUsageRow, recordAiUsage } from '../../../../lib/aiCost';
import { hangupLiveSession } from '../../../../lib/liveSessionsApi';

// Client-reported seconds are untrusted input; cap them at what the session
// could possibly have burned so a bad value cannot distort the cost ledger.
const USAGE_GRACE_SECONDS = 30;

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

async function resolveUserId(req) {
  const authz = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(authz).trim());
  if (!match) return { userId: null, error: null };
  try {
    const { data, error } = await getAdmin().auth.getUser(match[1].trim());
    return { userId: error ? null : data?.user?.id || null, error: null };
  } catch (error) {
    return { userId: null, error };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!originAllowed(req)) return res.status(403).json({ error: 'Forbidden' });

  const { userId, error: authError } = await resolveUserId(req);
  if (authError) {
    console.error('live end auth lookup failed:', authError.message);
    return res.status(503).json({ error: 'The AI examiner is temporarily unavailable.' });
  }
  if (!userId) return res.status(401).json({ error: 'Sign in to use the AI examiner.' });

  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
  if (!sessionId || sessionId.length > 200) {
    return res.status(400).json({ error: 'A session id is required.' });
  }
  const rawReason = typeof req.body?.reason === 'string' ? req.body.reason : '';
  const reason = /^[a-z_]{1,40}$/.test(rawReason) ? rawReason : 'client_end';

  let admin;
  try { admin = getAdmin(); }
  catch { return res.status(503).json({ error: 'The AI examiner is temporarily unavailable.' }); }

  let row;
  try {
    const { data, error } = await admin
      .from('live_examiner_sessions')
      .select('id, user_id, mode, duration_seconds, ended_at')
      .eq('id', sessionId)
      .maybeSingle();
    if (error) throw error;
    row = data;
  } catch (e) {
    console.error('live session lookup failed:', e.message);
    return res.status(503).json({ error: 'The AI examiner is temporarily unavailable.' });
  }
  // A session belonging to someone else is indistinguishable from a missing
  // one on purpose: ownership must not be probeable.
  if (!row || row.user_id !== userId) {
    return res.status(404).json({ error: 'Session not found.' });
  }

  const reported = Number(req.body?.usageSeconds);
  const cap = (Number(row.duration_seconds) || 0) + USAGE_GRACE_SECONDS;
  const usageSeconds = Number.isFinite(reported) && reported >= 0
    ? Math.min(reported, cap)
    : cap;

  try {
    await hangupLiveSession(sessionId);
  } catch (e) {
    // Leave ended_at null so the cron sweep retries; a session we failed to
    // hang up is still burning money.
    console.error('live hangup failed:', e.status || '', e.message);
    return res.status(502).json({ error: 'Could not end the session cleanly.' });
  }

  try {
    const { error } = await admin
      .from('live_examiner_sessions')
      .update({
        ended_at: new Date().toISOString(),
        end_reason: reason,
        client_usage_seconds: usageSeconds,
      })
      .eq('id', sessionId);
    if (error) throw error;
  } catch (e) {
    console.error('live session end update failed:', e.message);
  }

  // Only bill once: a repeat end call for an already-ended row is a no-op.
  if (!row.ended_at) {
    await recordAiUsage(
      admin,
      liveUsageRow({ userId, sessionId, usageSeconds, mode: row.mode, reason })
    );
  }

  return res.status(200).json({ ended: true });
}

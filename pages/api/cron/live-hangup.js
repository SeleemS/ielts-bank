// pages/api/cron/live-hangup.js
// Safety net for the Live examiner meter (docs/MONETIZATION.md §9). Live bills
// every session second until close or hangup, and the browser's close is best
// effort — a crashed tab, a dead battery or a lost network leaves a session
// running. Every 10 minutes (vercel.json) this sweeps rows whose deadline has
// passed and hangs them up server-side.
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { hangupLiveSession } from '../../../lib/liveSessionsApi';

const BATCH_SIZE = 50;
// After this many failed hangups the session has long since expired on
// OpenAI's side; stop retrying forever and mark the row for review.
const MAX_ATTEMPTS = 5;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.authorization !== `Bearer ${expected}`) return res.status(401).end();

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(503).json({ error: 'Live hangup sweep is not configured.' });
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'Live hangup sweep is not configured.' });
  }

  let admin;
  try {
    admin = createClient(url, key, { auth: { persistSession: false } });
  } catch (error) {
    console.error('live hangup client failed:', error.message);
    return res.status(503).json({ error: 'Live hangup sweep is not configured.' });
  }

  let rows;
  try {
    const { data, error } = await admin
      .from('live_examiner_sessions')
      .select('id, hangup_attempts')
      .is('ended_at', null)
      .lt('deadline_at', new Date().toISOString())
      .limit(BATCH_SIZE);
    if (error) throw error;
    rows = data || [];
  } catch (error) {
    console.error('live hangup query failed:', error.message);
    return res.status(503).json({ error: 'Live hangup sweep failed.' });
  }

  let hungUp = 0;
  let alreadyEnded = 0;
  let failed = 0;
  let abandoned = 0;

  for (const row of rows) {
    const attempts = (Number(row.hangup_attempts) || 0) + 1;
    let ok = true;
    let already = false;
    try {
      const result = await hangupLiveSession(row.id);
      already = Boolean(result.alreadyEnded);
    } catch (error) {
      ok = false;
      console.error('live hangup sweep failed for', row.id, error.message);
    }

    const giveUp = !ok && attempts >= MAX_ATTEMPTS;
    const update = { hangup_attempts: attempts };
    if (ok || giveUp) {
      update.ended_at = new Date().toISOString();
      update.end_reason = ok ? 'deadline_sweep' : 'hangup_failed';
    }
    try {
      const { error } = await admin
        .from('live_examiner_sessions')
        .update(update)
        .eq('id', row.id);
      if (error) throw error;
    } catch (error) {
      console.error('live hangup row update failed for', row.id, error.message);
    }

    if (ok) {
      hungUp += 1;
      if (already) alreadyEnded += 1;
    } else if (giveUp) {
      abandoned += 1;
    } else {
      failed += 1;
    }
  }

  return res.status(200).json({
    scanned: rows.length,
    hungUp,
    alreadyEnded,
    failed,
    abandoned,
  });
}

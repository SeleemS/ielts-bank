// pages/api/estimator/reveal.js
// Unlocks the Band Estimator's Writing band after sign-up.
//
// The anonymous scorer (/api/estimator/score-writing) deliberately never returns
// the band — it stores it against the visitor's anon_id. This route is the ONLY
// way to read it, and it requires a signed-in user. On the first claim it also
// mirrors the sample into the user's attempts/scores history so the baseline
// shows up on their dashboard.
//
// Free accounts get the band + the first criterion (same entitlement as the free
// Writing checker); Premium gets the full report.
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { originAllowed } from '../../../lib/apiSecurity';
import { fetchPremiumStatus } from '../../../lib/premium';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_AGE_DAYS = 30;

let _admin = null;
function getAdmin() {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-admin-not-configured');
  _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _admin;
}

async function resolveUserId(req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || '').trim());
  if (!match) return null;
  const { data, error } = await getAdmin().auth.getUser(match[1].trim());
  if (error || !data?.user) return null;
  if (data.user.is_anonymous === true) return null;
  return data.user.id;
}

// Mirror the estimator sample into the learner's own history (fail-soft: the
// reveal itself must still succeed if this write fails).
async function mirrorToHistory(admin, { userId, row }) {
  try {
    const { data: attempt, error: attemptErr } = await admin
      .from('attempts')
      .insert({
        user_id: userId,
        passage_id: null,
        skill: 'writing',
        responses: { essay: row.essay, source: 'band-estimator', wordCount: row.word_count },
        band: row.writing_band,
        submitted_at: row.created_at,
      })
      .select('id')
      .single();
    if (attemptErr || !attempt) return;
    const { error: scoreErr } = await admin.from('scores').insert({
      attempt_id: attempt.id,
      user_id: userId,
      skill: 'writing',
      overall_band: row.writing_band,
      criteria: row.result?.criteria || {},
      model: row.model || null,
    });
    if (scoreErr) await admin.from('attempts').delete().eq('id', attempt.id);
  } catch (error) {
    console.error('estimator reveal mirror failed:', error.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!originAllowed(req)) return res.status(403).json({ error: 'Forbidden' });

  let userId;
  try {
    userId = await resolveUserId(req);
  } catch {
    return res.status(503).json({ error: 'Could not verify your account. Please try again.' });
  }
  if (!userId) return res.status(401).json({ error: 'Sign in to reveal your Writing band.' });

  const anonId =
    typeof req.body?.anon_id === 'string' && UUID_RE.test(req.body.anon_id) ? req.body.anon_id : null;
  if (!anonId) return res.status(400).json({ error: 'Missing estimator reference.' });

  const admin = getAdmin();
  let row;
  try {
    const since = new Date(Date.now() - MAX_AGE_DAYS * 86400000).toISOString();
    const { data, error } = await admin
      .from('estimator_writing_scores')
      .select('id, essay, word_count, writing_band, result, model, created_at, claimed_by_user_id')
      .eq('anon_id', anonId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw error;
    // Unclaimed, or already claimed by THIS user (idempotent re-reveal).
    row = (data || []).find((r) => !r.claimed_by_user_id || r.claimed_by_user_id === userId) || null;
  } catch (error) {
    console.error('estimator reveal lookup failed:', error.message);
    return res.status(503).json({ error: 'Could not load your result. Please try again.' });
  }
  if (!row) return res.status(404).json({ error: 'No estimator writing sample found for this device.' });

  const firstClaim = !row.claimed_by_user_id;
  if (firstClaim) {
    try {
      const { data: claimed, error: claimError } = await admin
        .from('estimator_writing_scores')
        .update({ claimed_by_user_id: userId, claimed_at: new Date().toISOString() })
        .eq('id', row.id)
        .is('claimed_by_user_id', null)
        .select('id')
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) {
        return res.status(409).json({ error: 'This estimator result has already been claimed.' });
      }
    } catch (error) {
      console.error('estimator reveal claim failed:', error.message);
      return res.status(503).json({ error: 'Could not save this result to your account. Please try again.' });
    }
    await mirrorToHistory(admin, { userId, row });
  }

  const premium = await fetchPremiumStatus(admin, userId);
  if (premium.error) {
    return res.status(503).json({ error: 'Could not verify your plan. Please try again.' });
  }
  const { isPremium } = premium;
  const result = row.result || {};
  const criteria = result.criteria || {};
  const band = Number(row.writing_band);

  if (isPremium) {
    return res.status(200).json({
      band,
      wordCount: row.word_count,
      criteria,
      summary: result.summary || '',
      improvements: result.improvements || [],
      correctedExamples: result.correctedExamples || [],
      premium: true,
    });
  }

  // Free entitlement: the band + the first criterion in full, plus a count of
  // what Premium would unlock (never the locked text itself).
  const lockedIssueCount =
    Object.values(criteria).reduce(
      (n, c) => n + (Array.isArray(c?.improvements) ? c.improvements.length : 0),
      0
    ) +
    (Array.isArray(result.improvements) ? result.improvements.length : 0) +
    (Array.isArray(result.correctedExamples) ? result.correctedExamples.length : 0);

  return res.status(200).json({
    band,
    wordCount: row.word_count,
    criteria: { taskResponse: criteria.taskResponse || {} },
    lockedIssueCount,
    premium: false,
  });
}

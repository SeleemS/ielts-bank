// pages/api/live/session.js
// Mints a gpt-live-1 examiner session AND performs the WebRTC SDP exchange
// (docs/MONETIZATION.md §9). Unlike Realtime, Live has no ephemeral client
// secret: the browser posts its SDP offer here, we call OpenAI with the API
// key, and we hand back the answer. The browser never talks to OpenAI
// directly, so this route is the only place a session can be created — and
// the metering below is therefore a hard spend gate.
export const config = { runtime: 'nodejs' };

import { randomUUID } from 'node:crypto';
import { issueAssessmentTicket } from '../../../lib/realtimeAssessmentTicket';
import { createClient } from '@supabase/supabase-js';
import { clientIp, originAllowed } from '../../../lib/apiSecurity';
import { liveReservationRow, recordAiUsage } from '../../../lib/aiCost';
import { fetchPremiumStatus } from '../../../lib/premium';
import { MODES, pickSpeakingItem } from '../../../lib/realtimeExaminer';
import {
  LIVE_MODEL,
  buildLiveBackendInstructions,
  buildLiveSessionConfig,
  buildLiveVoiceInstructions,
  resolveLiveVoice,
} from '../../../lib/liveExaminer';
import { createLiveSession } from '../../../lib/liveSessionsApi';

const PER_IP_WINDOW_SECONDS = 3600;
const PER_IP_MAX = 8; // sessions/hour/IP
const GLOBAL_WINDOW_SECONDS = 86400;
const GLOBAL_MAX = 300; // hard daily ceiling (cost circuit breaker)
const MAX_SDP_CHARS = 200000;
// Grace on top of the metered duration: the browser's own timer stops the
// session first; this only bounds how long the cron sweep waits.
const DEADLINE_GRACE_SECONDS = 45;

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

async function withinLimit(bucket, identifier, windowSeconds, max, failClosed = false) {
  try {
    const { data, error } = await getAdmin().rpc('check_rate_limit', {
      p_bucket: bucket,
      p_identifier: identifier,
      p_window_seconds: windowSeconds,
      p_max: max,
    });
    if (!error) return data === true;
    console.error('check_rate_limit error:', error.message);
  } catch (error) {
    console.error('check_rate_limit error:', error.message);
  }
  return failClosed ? null : true;
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
  if (process.env.NEXT_PUBLIC_LIVE_EXAMINER !== 'true') {
    return res.status(503).json({ error: 'The live AI examiner is not enabled yet.' });
  }

  const { userId, error: authError } = await resolveUserId(req);
  if (authError) {
    console.error('live auth lookup failed:', authError.message);
    return res.status(503).json({ error: 'The AI examiner is temporarily unavailable.' });
  }
  if (!userId) return res.status(401).json({ error: 'Sign in to use the AI examiner.' });

  const mode = typeof req.body?.mode === 'string' ? req.body.mode : 'mock';
  if (!MODES[mode]) return res.status(400).json({ error: 'Unknown session mode.' });

  const sdp = typeof req.body?.sdp === 'string' ? req.body.sdp : '';
  if (!sdp || sdp.length > MAX_SDP_CHARS) {
    return res.status(400).json({ error: 'A valid WebRTC offer is required.' });
  }

  const premium = await fetchPremiumStatus(getAdmin(), userId);
  if (premium.error) {
    console.error('live entitlement lookup failed:', premium.error.message);
    return res.status(503).json({ error: 'The AI examiner is temporarily unavailable.' });
  }
  if (!premium.isPremium) {
    return res.status(402).json({
      error: 'The live AI examiner requires an active Premium plan.',
      reason: 'not_premium',
    });
  }

  const durationSeconds = MODES[mode].seconds;
  const wantsAudio = req.body?.audioAssessment === true;
  let assessment;
  if (wantsAudio) {
    if (process.env.NEXT_PUBLIC_REALTIME_AUDIO_ASSESSMENT !== 'true') {
      return res.status(503).json({ error: 'Audio assessment is not enabled yet.' });
    }
    try { assessment = issueAssessmentTicket({ userId, mode, durationSeconds }); }
    catch { return res.status(503).json({ error: 'Audio assessment is not configured yet.' }); }
  }

  // Both mint limits fail closed: an infrastructure outage must not create
  // unbounded Live spend (billed per session-minute, silence included).
  const ip = clientIp(req);
  const ipWithinLimit = await withinLimit(
    'live-mint-ip', ip, PER_IP_WINDOW_SECONDS, PER_IP_MAX, true
  );
  if (ipWithinLimit === null) {
    return res.status(503).json({ error: 'The AI examiner is temporarily unavailable.' });
  }
  if (!ipWithinLimit) {
    return res.status(429).json({ error: 'Too many sessions started. Please wait a while.' });
  }
  const globalWithinLimit = await withinLimit(
    'live-mint-global', 'all', GLOBAL_WINDOW_SECONDS, GLOBAL_MAX, true
  );
  if (globalWithinLimit === null) {
    return res.status(503).json({ error: 'The AI examiner is temporarily unavailable.' });
  }
  if (!globalWithinLimit) {
    return res.status(503).json({ error: 'The AI examiner is at capacity today. Please try again tomorrow.' });
  }

  // Meter BEFORE creating the session. Live shares the Realtime seconds quota:
  // it is the same product to the customer, just a different transport.
  let meter;
  try {
    const { data, error } = await getAdmin().rpc('consume_realtime_seconds', {
      p_uid: userId,
      p_seconds: durationSeconds,
    });
    if (error) throw error;
    meter = data;
  } catch (e) {
    console.error('live meter failed:', e.message);
    return res.status(503).json({ error: 'The AI examiner is temporarily unavailable.' });
  }
  if (!meter?.allowed) {
    const premiumIssue = meter?.reason === 'not_premium';
    return res.status(402).json({
      error: premiumIssue
        ? 'The live AI examiner is a Premium feature.'
        : 'You have used your AI examiner minutes for this period.',
      reason: meter?.reason || 'minutes_exhausted',
      remainingSeconds: meter?.remaining ?? 0,
      resetsAt: meter?.resetsAt || null,
    });
  }

  // Compensating refund: if the session never starts after the decrement,
  // give the seconds back atomically. The key makes every retry idempotent.
  const refundKey = randomUUID();
  async function refundSeconds() {
    try {
      const admin = getAdmin();
      const { error } = await admin.rpc('refund_realtime_seconds', {
        p_uid: userId,
        p_seconds: durationSeconds,
        p_refund_key: refundKey,
      });
      if (!error) return;
      if (!['PGRST202', '42883'].includes(error.code)) throw error;

      // Transitional compatibility while the production migration rolls out.
      // Only a confirmed missing-function error may use the legacy path:
      // falling back after an ambiguous RPC failure could double-refund.
      const { data: quota, error: readError } = await admin
        .from('user_quotas')
        .select('realtime_seconds_remaining, realtime_seconds_quota')
        .eq('user_id', userId)
        .single();
      if (readError) throw readError;
      if (!quota) throw new Error('realtime quota row not found for refund');
      const { error: updateError } = await admin
        .from('user_quotas')
        .update({
          realtime_seconds_remaining: Math.min(
            quota.realtime_seconds_quota,
            quota.realtime_seconds_remaining + durationSeconds
          ),
        })
        .eq('user_id', userId);
      if (updateError) throw updateError;
    } catch (e) {
      console.error('live refund failed:', e.message);
    }
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set');
    await refundSeconds();
    return res.status(502).json({ error: 'The AI examiner is temporarily unavailable.' });
  }

  try {
    const admin = getAdmin();
    const items = {};
    if (mode === 'mock' || mode === 'part1') items.part1 = await pickSpeakingItem(admin, 1);
    if (mode === 'mock' || mode === 'part2') items.part2 = await pickSpeakingItem(admin, 2);
    if (mode === 'mock' || mode === 'part3') items.part3 = await pickSpeakingItem(admin, 3);

    const voice = resolveLiveVoice();
    const body = buildLiveSessionConfig({
      instructions: buildLiveVoiceInstructions(mode, items, durationSeconds),
      backendInstructions: buildLiveBackendInstructions(mode),
      voice,
      sdp,
    });

    let session;
    try {
      session = await createLiveSession(body);
    } catch (e) {
      console.error('live session create failed:', e.status || '', e.message);
      await refundSeconds();
      return res.status(502).json({ error: 'Could not start the examiner session. Please try again.' });
    }

    // The row is what the end route and the cron sweep hang up against: an
    // untracked session would bill until OpenAI expires it.
    const { error: insertError } = await admin.from('live_examiner_sessions').insert({
      id: session.sessionId,
      user_id: userId,
      mode,
      duration_seconds: durationSeconds,
      deadline_at: new Date(
        Date.now() + (durationSeconds + DEADLINE_GRACE_SECONDS) * 1000
      ).toISOString(),
    });
    if (insertError) console.error('live session row insert failed:', insertError.message);

    await recordAiUsage(
      admin,
      liveReservationRow({
        userId,
        durationSeconds,
        mode,
        providerRequestId: session.sessionId,
      })
    );

    return res.status(200).json({
      ...(assessment ? { assessment } : {}),
      sessionId: session.sessionId,
      sdp: session.sdp,
      model: LIVE_MODEL,
      voice,
      mode,
      durationSeconds,
      remainingSeconds: meter.remaining,
      resetsAt: meter.resetsAt || null,
      topics: {
        part1: items.part1?.content?.topic || null,
        part2: items.part2?.content?.topic || null,
        part3: items.part3?.content?.theme || null,
      },
    });
  } catch (e) {
    console.error('live session error:', e.message);
    await refundSeconds();
    return res.status(502).json({ error: 'Could not start the examiner session. Please try again.' });
  }
}

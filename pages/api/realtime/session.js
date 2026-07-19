// pages/api/realtime/session.js
// Mints an ephemeral OpenAI Realtime client secret for a live AI-examiner
// speaking session (docs/MONETIZATION.md §9). Premium-only, metered in
// seconds via consume_realtime_seconds BEFORE the token is created, so a
// client can never start a session it has not paid minutes for.
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { clientIp, originAllowed } from '../../../lib/apiSecurity';
import { fetchIsPremium } from '../../../lib/premium';
import {
  MODES,
  REALTIME_MODEL,
  pickSpeakingItem,
  buildInstructions,
  buildSessionConfig,
} from '../../../lib/realtimeExaminer';

const OPENAI_CLIENT_SECRETS_URL = 'https://api.openai.com/v1/realtime/client_secrets';
const PER_IP_WINDOW_SECONDS = 3600;
const PER_IP_MAX = 8; // sessions/hour/IP
const GLOBAL_WINDOW_SECONDS = 86400;
const GLOBAL_MAX = 300; // hard daily ceiling (cost circuit breaker)

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
  const { data, error } = await getAdmin().rpc('check_rate_limit', {
    p_bucket: bucket,
    p_identifier: identifier,
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  if (error) {
    console.error('check_rate_limit error:', error.message);
    return !failClosed;
  }
  return data === true;
}

async function resolveUserId(req) {
  const authz = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(authz).trim());
  if (!match) return null;
  const { data, error } = await getAdmin().auth.getUser(match[1].trim());
  if (error || !data?.user) return null;
  return data.user.id;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!originAllowed(req)) return res.status(403).json({ error: 'Forbidden' });

  const userId = await resolveUserId(req);
  if (!userId) return res.status(401).json({ error: 'Sign in to use the AI examiner.' });

  const mode = typeof req.body?.mode === 'string' ? req.body.mode : 'mock';
  if (!MODES[mode]) return res.status(400).json({ error: 'Unknown session mode.' });
  if (!(await fetchIsPremium(getAdmin(), userId))) {
    return res.status(402).json({
      error: 'The live AI examiner requires an active Premium plan.',
      reason: 'not_premium',
    });
  }
  const durationSeconds = MODES[mode].seconds;

  // Rate limits: per-IP fails open (availability), global fails closed (spend).
  const ip = clientIp(req);
  if (!(await withinLimit('realtime-mint-ip', ip, PER_IP_WINDOW_SECONDS, PER_IP_MAX))) {
    return res.status(429).json({ error: 'Too many sessions started. Please wait a while.' });
  }
  if (!(await withinLimit('realtime-mint-global', 'all', GLOBAL_WINDOW_SECONDS, GLOBAL_MAX, true))) {
    return res.status(503).json({ error: 'The AI examiner is at capacity today. Please try again tomorrow.' });
  }

  // Meter BEFORE minting, after a separate entitlement check. Keeping the
  // quota intact during a billing pause lets access resume automatically.
  let meter;
  try {
    const { data, error } = await getAdmin().rpc('consume_realtime_seconds', {
      p_uid: userId,
      p_seconds: durationSeconds,
    });
    if (error) throw error;
    meter = data;
  } catch (e) {
    console.error('realtime meter failed:', e.message);
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

  // Compensating refund: if minting fails after the decrement, give the
  // seconds back so a transient OpenAI error never eats a user's minutes.
  async function refundSeconds() {
    try {
      const { data: q } = await getAdmin()
        .from('user_quotas')
        .select('realtime_seconds_remaining, realtime_seconds_quota')
        .eq('user_id', userId)
        .single();
      if (q) {
        await getAdmin()
          .from('user_quotas')
          .update({
            realtime_seconds_remaining: Math.min(
              q.realtime_seconds_quota,
              q.realtime_seconds_remaining + durationSeconds
            ),
          })
          .eq('user_id', userId);
      }
    } catch (e) {
      console.error('realtime refund failed:', e.message);
    }
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set');
    await refundSeconds();
    return res.status(502).json({ error: 'The AI examiner is temporarily unavailable.' });
  }

  try {
    // Pick content for the requested mode.
    const admin = getAdmin();
    const items = {};
    if (mode === 'mock' || mode === 'part1') items.part1 = await pickSpeakingItem(admin, 1);
    if (mode === 'mock' || mode === 'part2') items.part2 = await pickSpeakingItem(admin, 2);
    if (mode === 'mock' || mode === 'part3') items.part3 = await pickSpeakingItem(admin, 3);

    const instructions = buildInstructions(mode, items, durationSeconds);
    const body = buildSessionConfig(instructions);

    const r = await fetch(OPENAI_CLIENT_SECRETS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const payload = await r.json().catch(() => ({}));
    if (!r.ok || !payload?.value) {
      console.error('client_secrets failed:', r.status, payload?.error?.message || 'no value');
      await refundSeconds();
      return res.status(502).json({ error: 'Could not start the examiner session. Please try again.' });
    }

    return res.status(200).json({
      clientSecret: payload.value,
      expiresAt: payload.expires_at || null,
      model: REALTIME_MODEL,
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
    console.error('realtime session error:', e.message);
    await refundSeconds();
    return res.status(502).json({ error: 'Could not start the examiner session. Please try again.' });
  }
}

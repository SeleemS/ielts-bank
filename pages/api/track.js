export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { clientIp, originAllowed } from '../../lib/apiSecurity';

const EVENT_RE = /^[a-z][a-z0-9_]{1,63}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTERNAL_PATH_RE = /^\/(?:api|_next|gt|data)(?:\/|$)/;
const SKILLS = new Set(['reading', 'writing', 'listening', 'speaking']);

let adminClient = null;
function admin() {
  if (adminClient) return adminClient;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-admin-not-configured');
  adminClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return adminClient;
}

function safeProps(body) {
  const blocked = /essay|transcript|response|audio|token|email/i;
  return Object.fromEntries(
    Object.entries(body)
      .filter(([key, value]) =>
        !['event', 'anon_id', 'skill', 'slug', 'client_event_id', 'session_id', 'page_view_id', 'occurred_at'].includes(key) &&
        !blocked.test(key) &&
        (value == null || ['string', 'number', 'boolean'].includes(typeof value))
      )
      .slice(0, 30)
      .map(([key, value]) => [key.slice(0, 64), typeof value === 'string' ? value.slice(0, 500) : value])
  );
}

function optionalUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value.trim()) ? value.trim() : null;
}

function occurredAt(value) {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const now = Date.now();
  if (parsed < now - 7 * 24 * 60 * 60 * 1000 || parsed > now + 5 * 60 * 1000) return null;
  return new Date(parsed).toISOString();
}

// ISO 3166-1 alpha-2 country from Vercel's geo header (absent in local dev).
function requestCountry(req) {
  const raw = String(req.headers['x-vercel-ip-country'] || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(raw) ? raw : null;
}

// On login, stamp signup attribution (first-write-wins) and refresh login
// stats on public.users. Fail-soft: a missing RPC must not drop the event.
async function recordLogin(body, resolvedUserId, country) {
  const str = (key, max) => (typeof body[key] === 'string' ? body[key].slice(0, max) : null);
  const utm = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
    if (typeof body[key] === 'string' && body[key]) utm[key] = body[key].slice(0, 200);
  }
  const { error } = await admin().rpc('record_login', {
    p_user_id: resolvedUserId,
    p_country: country,
    p_source: str('acquisition_source', 200) || str('source', 200),
    p_referrer: str('referrer', 300),
    p_landing: str('landing', 200),
    p_utm: Object.keys(utm).length ? utm : null,
  });
  if (error) console.error('record_login failed:', error.message);
}

async function userId(req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || '').trim());
  if (!match) return null;
  const { data, error } = await admin().auth.getUser(match[1]);
  return error ? null : data?.user?.id || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!originAllowed(req)) return res.status(403).json({ error: 'Origin not allowed.' });

  const body = req.body || {};
  const event = typeof body.event === 'string' ? body.event.trim() : '';
  const anonId = typeof body.anon_id === 'string' ? body.anon_id.trim() : '';
  if (!EVENT_RE.test(event) || !UUID_RE.test(anonId)) {
    return res.status(400).json({ error: 'Invalid telemetry payload.' });
  }
  const eventPath = typeof body.path === 'string' ? body.path.trim() : '';
  if (INTERNAL_PATH_RE.test(eventPath.split(/[?#]/, 1)[0])) {
    return res.status(202).json({ ok: true, ignored: true });
  }

  try {
    const ip = clientIp(req);
    const { data: allowed, error: limitError } = await admin().rpc('check_rate_limit', {
      p_bucket: 'activity-events',
      p_identifier: ip,
      p_window_seconds: 60,
      p_max: 120,
    });
    if (limitError) {
      console.error('track rate-limit check failed:', limitError.message);
      return res.status(503).json({ error: 'Telemetry unavailable.' });
    }
    if (allowed !== true) {
      return res.status(429).json({ error: 'Rate limited.' });
    }

    const country = requestCountry(req);
    const resolvedUserId = await userId(req);
    if (resolvedUserId) {
      await admin().from('activity_events').update({ user_id: resolvedUserId }).eq('anon_id', anonId).is('user_id', null);
      if (event === 'login') await recordLogin(body, resolvedUserId, country);
    }
    const { error } = await admin().from('activity_events').insert({
      anon_id: anonId,
      user_id: resolvedUserId,
      event,
      skill: SKILLS.has(body.skill) ? body.skill : null,
      slug: typeof body.slug === 'string' ? body.slug.slice(0, 200) : null,
      country,
      client_event_id: optionalUuid(body.client_event_id),
      session_id: optionalUuid(body.session_id),
      page_view_id: optionalUuid(body.page_view_id),
      occurred_at: occurredAt(body.occurred_at),
      props: safeProps(body),
    });
    if (error) throw error;
    return res.status(202).json({ ok: true });
  } catch (error) {
    console.error('track insert failed:', error.message);
    return res.status(503).json({ error: 'Telemetry unavailable.' });
  }
}

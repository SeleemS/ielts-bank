export const config = { api: { bodyParser: { sizeLimit: '16kb' } }, runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { clientIp } from '../../lib/apiSecurity';

const LIMIT_WINDOW_SECONDS = 60;
const PER_IP_MAX = 30;
const GLOBAL_MAX = 300;
const LIMITER_ERROR_LOG_INTERVAL_MS = 60_000;

let _admin = null;
let lastLimiterErrorLog = 0;

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

async function withinLimit(bucket, identifier, max) {
  try {
    const { data, error } = await getAdmin().rpc('check_rate_limit', {
      p_bucket: bucket,
      p_identifier: identifier,
      p_window_seconds: LIMIT_WINDOW_SECONDS,
      p_max: max,
    });
    if (error) throw error;
    return data === true;
  } catch (error) {
    const now = Date.now();
    if (now - lastLimiterErrorLog >= LIMITER_ERROR_LOG_INTERVAL_MS) {
      lastLimiterErrorLog = now;
      console.error('csp-report rate-limit check failed:', error.message);
    }
    return false;
  }
}

function parseBody(value) {
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value !== 'string') return value || {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function cleanReportText(value, max) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function safeReportUrl(value) {
  const raw = cleanReportText(value, 2000);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return `${parsed.origin}${parsed.pathname}`.slice(0, 500);
    }
    return parsed.protocol.slice(0, 500);
  } catch {
    return raw.replace(/[?#].*$/, '').slice(0, 500);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  const payload = parseBody(req.body);
  const envelope = Array.isArray(payload) ? payload[0] || {} : payload;
  const report = envelope['csp-report'] || envelope.body || envelope;
  const safe = {
    blocked: safeReportUrl(report['blocked-uri'] || report.blockedURL),
    directive: cleanReportText(
      report['violated-directive'] || report.effectiveDirective,
      120
    ),
    document: safeReportUrl(report['document-uri'] || report.documentURL),
    disposition: cleanReportText(report.disposition, 40),
  };

  // Empty or malformed reports have no diagnostic value. Acknowledge them
  // without spending a database counter or creating a production log entry.
  if (!Object.values(safe).some(Boolean)) return res.status(204).end();

  // Reporting is deliberately unauthenticated, so protect the log sink with
  // both a client allowance and a distributed ceiling. Limiter denials and
  // outages are acknowledged without logging the untrusted report; browsers
  // do not need to retry telemetry that the server has chosen to discard.
  const ipAllowed = await withinLimit('csp-report-ip', clientIp(req), PER_IP_MAX);
  if (!ipAllowed) return res.status(204).end();
  const globalAllowed = await withinLimit('csp-report-global', 'all', GLOBAL_MAX);
  if (!globalAllowed) return res.status(204).end();

  console.warn('csp-violation', safe);
  return res.status(204).end();
}

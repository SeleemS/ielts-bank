// Session-time aggregation for the daily report.
//
// A "session" is every activity_events row sharing one client session_id
// (per-tab sessionStorage UUID stamped by src/lib/analytics.js); its duration
// is last event minus first event. session_heartbeat rows (idle-aware, see
// src/lib/sessionHeartbeat.js) keep quiet-reading sessions ticking, so
// durations approximate ENGAGED time: backgrounded/idle tabs stop producing
// events and stop counting. Single-event sessions count as 0s bounces — that
// keeps the average honest rather than flattering.

const MAX_SESSION_SECONDS = 4 * 60 * 60; // clock-skew / stray-row guard

function eventTime(row) {
  const iso = row.occurred_at || row.created_at;
  const parsed = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

// rows: activity_events with { session_id, anon_id, user_id, occurred_at, created_at }.
// Returns { count, visitors, totalSeconds, avgSeconds, medianSeconds, perVisitorAvgSeconds }.
export function sessionStats(rows) {
  const sessions = new Map();
  for (const row of rows || []) {
    if (!row || !row.session_id) continue; // rows predating the session_id column
    const ts = eventTime(row);
    if (ts == null) continue;
    const existing = sessions.get(row.session_id);
    if (!existing) {
      sessions.set(row.session_id, { min: ts, max: ts, visitor: row.user_id || row.anon_id || row.session_id });
    } else {
      if (ts < existing.min) existing.min = ts;
      if (ts > existing.max) existing.max = ts;
      if (!existing.visitor) existing.visitor = row.user_id || row.anon_id || row.session_id;
    }
  }

  const durations = [];
  const perVisitorSeconds = new Map();
  for (const s of sessions.values()) {
    const seconds = Math.min(Math.max((s.max - s.min) / 1000, 0), MAX_SESSION_SECONDS);
    durations.push(seconds);
    perVisitorSeconds.set(s.visitor, (perVisitorSeconds.get(s.visitor) || 0) + seconds);
  }

  const count = durations.length;
  if (!count) {
    return { count: 0, visitors: 0, totalSeconds: 0, avgSeconds: null, medianSeconds: null, perVisitorAvgSeconds: null };
  }
  const totalSeconds = Math.round(durations.reduce((a, b) => a + b, 0));
  const sorted = [...durations].sort((a, b) => a - b);
  const mid = Math.floor(count / 2);
  const median = count % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const visitors = perVisitorSeconds.size;
  return {
    count,
    visitors,
    totalSeconds,
    avgSeconds: Math.round(totalSeconds / count),
    medianSeconds: Math.round(median),
    perVisitorAvgSeconds: Math.round(totalSeconds / visitors),
  };
}

// 95 -> "1m 35s", 45 -> "45s", 3712 -> "1h 1m". Null-safe for em-dash rows.
export function fmtDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

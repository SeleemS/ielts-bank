// Idle-aware session heartbeat so activity_events can measure session time.
//
// Every event already carries a per-tab session_id (src/lib/analytics.js), so
// session duration is simply last-event minus first-event per session. What
// breaks that is quiet reading: a visitor who loads a passage and reads for
// ten minutes fires nothing after page_view. This module emits a first-party
// `session_heartbeat` while the tab is BOTH visible and recently active
// (input/scroll within IDLE_MS), plus one flush when the tab is hidden so the
// session's real end — and sub-interval visits — register.
//
// Volume: one event per HEARTBEAT_MS of engaged time (~10 events for a
// 10-minute visit) against /api/track's 120/min/IP limit. Heartbeats skip GA
// (firstPartyOnly) — they are meter ticks, not behavioral events.

import { track } from './analytics';

const HEARTBEAT_MS = 60_000;
const IDLE_MS = 90_000;
// Min gap before the hidden-flush fires again, so app-switching on mobile
// doesn't spam events.
const HIDDEN_FLUSH_MIN_GAP_MS = 15_000;
// mousemove fires continuously; recording activity once a second is plenty.
const ACTIVITY_SAMPLE_MS = 1_000;

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'];

export function startSessionHeartbeat({ now = () => Date.now() } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  let lastActivity = now();
  let lastSent = 0;

  const onActivity = () => {
    const ts = now();
    if (ts - lastActivity >= ACTIVITY_SAMPLE_MS) lastActivity = ts;
  };

  const send = () => {
    lastSent = now();
    track('session_heartbeat', {}, { firstPartyOnly: true });
  };

  const onTick = () => {
    if (document.visibilityState !== 'visible') return;
    if (now() - lastActivity > IDLE_MS) return;
    send();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState !== 'hidden') return;
    if (now() - lastActivity > IDLE_MS) return;
    if (now() - lastSent < HIDDEN_FLUSH_MIN_GAP_MS) return;
    send();
  };

  for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
  const interval = window.setInterval(onTick, HEARTBEAT_MS);

  return () => {
    for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.clearInterval(interval);
  };
}

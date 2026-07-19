import { describe, expect, it } from 'vitest';
import { sessionStats, fmtDuration } from './sessionStats';

const T0 = Date.parse('2026-07-19T10:00:00.000Z');
const iso = (offsetSeconds) => new Date(T0 + offsetSeconds * 1000).toISOString();
const row = (sessionId, offsetSeconds, extra = {}) => ({
  session_id: sessionId,
  anon_id: extra.anon_id || 'anon-1',
  user_id: extra.user_id || null,
  occurred_at: iso(offsetSeconds),
  created_at: iso(offsetSeconds + 2), // server later than client; occurred_at wins
  ...extra,
});

describe('sessionStats', () => {
  it('returns null-metric shape with no usable rows', () => {
    expect(sessionStats([])).toEqual({
      count: 0, visitors: 0, totalSeconds: 0, avgSeconds: null, medianSeconds: null, perVisitorAvgSeconds: null,
    });
    // rows predating the session_id column are skipped, not crashed on
    expect(sessionStats([{ session_id: null, anon_id: 'a', occurred_at: iso(0) }]).count).toBe(0);
  });

  it('computes duration as last minus first event per session', () => {
    const stats = sessionStats([row('s1', 0), row('s1', 60), row('s1', 300)]);
    expect(stats.count).toBe(1);
    expect(stats.avgSeconds).toBe(300);
    expect(stats.perVisitorAvgSeconds).toBe(300);
  });

  it('counts single-event sessions as 0s bounces and averages across sessions', () => {
    const stats = sessionStats([
      row('s1', 0), row('s1', 200), // 200s
      row('s2', 0, { anon_id: 'anon-2' }), // bounce, 0s
    ]);
    expect(stats.count).toBe(2);
    expect(stats.avgSeconds).toBe(100);
    expect(stats.medianSeconds).toBe(100);
    expect(stats.visitors).toBe(2);
  });

  it('sums multiple sessions of one visitor for the per-visitor average', () => {
    const stats = sessionStats([
      row('s1', 0), row('s1', 120), // visitor anon-1: 120s
      row('s2', 1000), row('s2', 1060), // same visitor, second session: 60s
      row('s3', 0, { anon_id: 'anon-2' }), row('s3', 20, { anon_id: 'anon-2' }), // 20s
    ]);
    expect(stats.count).toBe(3);
    expect(stats.visitors).toBe(2);
    expect(stats.perVisitorAvgSeconds).toBe(100); // (180 + 20) / 2
  });

  it('prefers user_id over anon_id as the visitor key', () => {
    const stats = sessionStats([
      row('s1', 0, { user_id: 'u1', anon_id: 'anon-1' }), row('s1', 100, { user_id: 'u1' }),
      row('s2', 0, { user_id: 'u1', anon_id: 'anon-9' }), row('s2', 100, { user_id: 'u1' }),
    ]);
    expect(stats.visitors).toBe(1);
    expect(stats.perVisitorAvgSeconds).toBe(200);
  });

  it('falls back to created_at when occurred_at is missing and clamps outliers', () => {
    const stats = sessionStats([
      { session_id: 's1', anon_id: 'a', occurred_at: null, created_at: iso(0) },
      { session_id: 's1', anon_id: 'a', occurred_at: null, created_at: iso(50) },
      // 3 days apart in one "session" — clamped to the 4h cap, not 72h
      row('s2', 0, { anon_id: 'b' }), row('s2', 72 * 3600, { anon_id: 'b' }),
    ]);
    expect(stats.count).toBe(2);
    const sorted = [50, 4 * 3600];
    expect(stats.totalSeconds).toBe(sorted[0] + sorted[1]);
  });
});

describe('fmtDuration', () => {
  it('formats seconds, minutes and hours', () => {
    expect(fmtDuration(45)).toBe('45s');
    expect(fmtDuration(95)).toBe('1m 35s');
    expect(fmtDuration(3712)).toBe('1h 1m');
  });
  it('em-dashes null/invalid', () => {
    expect(fmtDuration(null)).toBe('—');
    expect(fmtDuration(NaN)).toBe('—');
  });
});

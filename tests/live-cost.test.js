// tests/live-cost.test.js
// Live cost rows and the planning estimate. The Live meter is flat per
// session-second, so these numbers are simple — and therefore worth locking
// down, because they are the only signal we have that a session was billed.
import { describe, expect, it } from 'vitest';
import { LIVE_PRICES, liveReservationRow, liveUsageRow } from '../lib/aiCost';
import { estimateLiveSpeakingCost } from '../lib/realtimeCost';

describe('live cost rows', () => {
  it('publishes the verified Live prices', () => {
    expect(LIVE_PRICES).toEqual({ sessionPerMinute: 0.05, initSeconds: 15 });
  });

  it('reserves the full session duration plus a backend allowance', () => {
    const row = liveReservationRow({
      userId: 'u1',
      durationSeconds: 840,
      mode: 'mock',
      providerRequestId: 'live_abc',
    });
    expect(row).toMatchObject({
      user_id: 'u1',
      skill: 'speaking',
      feature: 'speaking_live',
      operation: 'session_reservation',
      provider: 'openai',
      model: 'gpt-live-1',
      provider_request_id: 'live_abc',
      audio_seconds: 840,
      audio_rate_per_minute: 0.05,
      pricing_known: true,
      estimated: true,
      succeeded: true,
    });
    expect(row.cost_usd).toBeCloseTo((840 / 60) * 0.05 + 0.1, 8);
    expect(row.metadata).toMatchObject({
      mode: 'mock',
      methodology: 'reserved_duration_estimate',
    });
    expect(row.metadata.backend_model).toBeTruthy();
  });

  it('records client-reported usage as an estimate', () => {
    const row = liveUsageRow({
      userId: 'u1',
      sessionId: 'live_abc',
      usageSeconds: 300,
      mode: 'part1',
      reason: 'timer',
    });
    expect(row).toMatchObject({
      feature: 'speaking_live',
      operation: 'session_usage',
      provider_request_id: 'live_abc',
      audio_seconds: 300,
      estimated: true,
      pricing_known: true,
    });
    expect(row.cost_usd).toBeCloseTo(0.25, 8);
    expect(row.metadata).toMatchObject({
      mode: 'part1',
      session_id: 'live_abc',
      end_reason: 'timer',
      source: 'client_reported',
    });
  });

  it('floors every row at the 15 s WebRTC create charge', () => {
    // An abandoned session still costs the up-front 15 s.
    expect(liveUsageRow({ userId: 'u1', usageSeconds: 2 }).cost_usd)
      .toBeCloseTo((15 / 60) * 0.05, 8);
    expect(liveUsageRow({ userId: 'u1', usageSeconds: -5 }).cost_usd)
      .toBeCloseTo((15 / 60) * 0.05, 8);
    expect(liveUsageRow({ userId: 'u1', usageSeconds: 'nonsense' }).audio_seconds).toBe(0);
  });
});

describe('estimateLiveSpeakingCost', () => {
  it('prices the voice line at a flat per-minute rate', () => {
    const estimate = estimateLiveSpeakingCost({ minutes: 14 });
    expect(estimate.voice).toBeCloseTo(0.7, 8);
    expect(estimate.backendUsd).toBe(0.1);
    expect(estimate.assessmentUsd).toBe(0.1);
    expect(estimate.total).toBeCloseTo(0.9, 8);
    expect(estimate.note).toMatch(/silence/i);
  });

  it('accepts explicit backend and assessment budgets', () => {
    const estimate = estimateLiveSpeakingCost({ minutes: 5, backendUsd: 0.02, assessmentUsd: 0 });
    expect(estimate.total).toBeCloseTo(0.27, 8);
  });

  it('rejects a nonsense scenario rather than inventing a number', () => {
    expect(() => estimateLiveSpeakingCost({ minutes: -1 })).toThrow('invalid-cost-scenario');
    expect(() => estimateLiveSpeakingCost({ minutes: NaN })).toThrow('invalid-cost-scenario');
  });
});

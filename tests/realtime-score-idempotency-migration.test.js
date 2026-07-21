import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260721222000_realtime_score_idempotency.sql',
    import.meta.url
  ),
  'utf8'
).toLowerCase();

describe('realtime score idempotency migration', () => {
  it('keeps request transcripts in a private, expiring ledger', () => {
    expect(migration).toContain('private.realtime_score_requests');
    expect(migration).toContain('request_id uuid primary key');
    expect(migration).toContain('lease_id uuid not null');
    expect(migration).toContain('pg_column_size(transcript) <= 262144');
    expect(migration).toContain("expires_at timestamptz not null default (now() + interval '24 hours')");
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('revoke all on table private.realtime_score_requests');
    expect(migration).toContain('attempts_realtime_request_id_unique_idx');
    expect(migration).toContain("responses ->> 'realtime_request_id'");
  });

  it('uses a row-locked lease to claim, replay, or defer duplicate requests', () => {
    expect(migration).toContain('function public.claim_realtime_score_request');
    expect(migration).toContain('for update');
    expect(migration).toContain("'claimed'::text");
    expect(migration).toContain("'replay'::text");
    expect(migration).toContain("'busy'::text");
    expect(migration).toContain("interval '2 minutes'");
    expect(migration).toContain('pg_column_size(p_transcript) > 262144');
  });

  it('requires the active lease to complete or fail a claim', () => {
    expect(migration).toContain('function public.complete_realtime_score_request');
    expect(migration).toContain('function public.fail_realtime_score_request');
    expect(migration).toContain('v_row.lease_id <> p_lease_id');
    expect(migration).toContain('function public.cleanup_realtime_score_requests');
  });

  it('restricts every public RPC to service_role with a fixed search path', () => {
    expect(migration.match(/security definer/g)).toHaveLength(4);
    expect(migration.match(/set search_path = ''/g)).toHaveLength(4);
    expect(migration).toContain('from public, anon, authenticated, service_role');
    expect(migration).toContain('to service_role');
  });
});

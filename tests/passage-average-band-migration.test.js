import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260720195624_passage_average_band_stats.sql',
    import.meta.url
  ),
  'utf8'
).toLowerCase();

describe('passage average band migration', () => {
  it('stores a seed separately from the exact submitted aggregate', () => {
    expect(migration).toContain('seed_average_band');
    expect(migration).toContain('band_score_sum');
    expect(migration).toContain('band_submission_count');
    expect(migration).toContain('average_user_band');
    expect(migration).toContain('generated always as');
  });

  it('backfills prior attempts and switches on new total submissions', () => {
    expect(migration).toContain('from public.attempts attempt');
    expect(migration).toContain('before insert or update of difficulty, skill on public.passages');
    expect(migration).toContain('after insert or delete on public.attempts');
    expect(migration).toContain("target_skill not in ('reading', 'listening', 'writing')");
  });

  it('keeps the privileged trigger function out of the exposed schema', () => {
    expect(migration).toContain('function private.sync_passage_average_band()');
    expect(migration).toContain('security definer');
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain('from public, anon, authenticated');
  });
});

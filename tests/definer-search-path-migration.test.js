import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260719204100_harden_definer_search_paths.sql',
    import.meta.url
  ),
  'utf8'
)
  .replace(/--[^\n]*/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const targetSignatures = [
  'public.check_rate_limit(text, text, integer, integer)',
  'public.handle_new_user()',
  'public.handle_user_update()',
  'public.record_login(uuid, text, text, text, text, jsonb)',
];

describe('SECURITY DEFINER search-path hardening migration', () => {
  it.each(targetSignatures)('pins %s to an empty search path', (signature) => {
    expect(migration).toContain(`alter function ${signature} set search_path = ''`);
  });

  it('alters exact signatures without replacing audited function bodies', () => {
    expect(migration.match(/alter function/g)).toHaveLength(targetSignatures.length);
    expect(migration).not.toContain('create or replace function');
    expect(migration).not.toContain('search_path = public');
  });
});

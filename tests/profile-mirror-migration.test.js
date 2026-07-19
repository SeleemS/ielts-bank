import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260719203000_protect_auth_profile_mirror.sql',
    import.meta.url
  ),
  'utf8'
)
  .replace(/--[^\n]*/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

describe('auth profile mirror migration', () => {
  it('backfills every missing profile idempotently from Auth metadata', () => {
    expect(migration).toContain('insert into public.users');
    expect(migration).toContain('from auth.users auth_user left join public.users profile');
    expect(migration).toContain('where profile.id is null on conflict (id) do nothing');
    expect(migration).toContain('coalesce(auth_user.is_anonymous, auth_user.email is null)');
    expect(migration).toContain('auth_user.created_at');
    expect(migration).toContain('coalesce(auth_user.updated_at, auth_user.created_at)');
  });

  it('backfills a quota row for every repaired or pre-existing profile', () => {
    expect(migration).toContain('insert into public.user_quotas (user_id)');
    expect(migration).toContain(
      'from public.users profile left join public.user_quotas quota on quota.user_id = profile.id'
    );
    expect(migration).toContain('where quota.user_id is null on conflict (user_id) do nothing');
  });

  it('blocks direct profile deletion only while the Auth owner exists', () => {
    expect(migration).toContain('if exists ( select 1 from auth.users auth_user');
    expect(migration).toContain('where auth_user.id = old.id');
    expect(migration).toContain("errcode = '23503'");
    expect(migration).toContain('return old');
    expect(migration).toContain(
      'create trigger users_prevent_orphan_delete before delete on public.users'
    );
  });

  it('hardens the guard function against direct API execution and search-path injection', () => {
    expect(migration).toContain(
      'create or replace function public.prevent_orphaned_auth_profile() returns trigger language plpgsql security definer set search_path = \'\''
    );
    expect(migration).toContain(
      'revoke all on function public.prevent_orphaned_auth_profile() from public'
    );
    expect(migration).toContain('from anon, authenticated, service_role');
  });
});

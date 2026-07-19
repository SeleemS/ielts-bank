-- Restore and preserve the required 1:1 auth.users -> public.users mirror.
--
-- The signup trigger creates the mirror, but privileged/out-of-band deletion
-- of public.users can still orphan a live Auth account and cascade-delete its
-- quota and practice data. Backfill current gaps, then reject direct profile
-- deletion while the owning Auth row still exists. A proper auth.users delete
-- remains valid: PostgreSQL removes the parent before running the FK cascade,
-- so the guard sees no live Auth row and permits the child deletion.

insert into public.users (
  id,
  email,
  display_name,
  is_anonymous,
  created_at,
  updated_at
)
select
  auth_user.id,
  auth_user.email,
  coalesce(
    nullif(auth_user.raw_user_meta_data ->> 'full_name', ''),
    nullif(auth_user.raw_user_meta_data ->> 'name', '')
  ),
  coalesce(auth_user.is_anonymous, auth_user.email is null),
  auth_user.created_at,
  coalesce(auth_user.updated_at, auth_user.created_at)
from auth.users auth_user
left join public.users profile on profile.id = auth_user.id
where profile.id is null
on conflict (id) do nothing;

insert into public.user_quotas (user_id)
select profile.id
from public.users profile
left join public.user_quotas quota on quota.user_id = profile.id
where quota.user_id is null
on conflict (user_id) do nothing;

create or replace function public.prevent_orphaned_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from auth.users auth_user
    where auth_user.id = old.id
  ) then
    raise exception 'Cannot delete a profile while its Auth user still exists.'
      using
        errcode = '23503',
        hint = 'Delete the account through Supabase Auth so dependent data cascades safely.';
  end if;

  return old;
end;
$$;

revoke all on function public.prevent_orphaned_auth_profile() from public;
revoke all on function public.prevent_orphaned_auth_profile()
  from anon, authenticated, service_role;

drop trigger if exists users_prevent_orphan_delete on public.users;
create trigger users_prevent_orphan_delete
  before delete on public.users
  for each row execute function public.prevent_orphaned_auth_profile();

comment on function public.prevent_orphaned_auth_profile() is
  'Blocks direct public.users deletion while auth.users still owns the account; Auth deletion cascades remain allowed.';

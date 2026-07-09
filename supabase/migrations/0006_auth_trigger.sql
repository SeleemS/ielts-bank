-- 0006_auth_trigger.sql
-- Auth mapping: create a public.users row (and a default user_quotas row)
-- whenever a new auth.users row is created. Runs as SECURITY DEFINER so it can
-- insert past RLS.
--
-- AUTH FLOW (replaces the previously-planned Firebase Auth):
--   1. First visit -> Supabase anonymous sign-in (supabase.auth.signInAnonymously()).
--      auth.users gets a row with is_anonymous = true; this trigger mirrors it
--      into public.users and seeds user_quotas.
--   2. Upgrade    -> the SAME session links a Google OAuth identity or an email
--      magic-link (supabase.auth.linkIdentity / updateUser). The auth user id is
--      PRESERVED, so all existing attempts/scores stay attached to the user.
--   3. On upgrade, auth metadata (email / is_anonymous) changes; the second
--      trigger below keeps public.users.email + is_anonymous in sync.

-- ---------------------------------------------------------------------------
-- Insert public.users + user_quotas on new auth user.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, is_anonymous, display_name)
  values (
    new.id,
    new.email,
    coalesce((new.raw_user_meta_data ->> 'is_anonymous')::boolean, new.email is null),
    new.raw_user_meta_data ->> 'full_name'
  )
  on conflict (id) do nothing;

  insert into public.user_quotas (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Keep public.users in sync when the auth user upgrades (anon -> Google/email).
-- ---------------------------------------------------------------------------
create or replace function public.handle_user_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
     set email        = new.email,
         is_anonymous = coalesce((new.raw_user_meta_data ->> 'is_anonymous')::boolean, new.email is null),
         display_name = coalesce(new.raw_user_meta_data ->> 'full_name', public.users.display_name),
         updated_at   = now()
   where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_user_update();

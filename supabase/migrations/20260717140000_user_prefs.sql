-- 20260717140000_user_prefs.sql
-- Small per-user UI preferences (e.g. "don't show the listening intro modal
-- again"). Stored as a single jsonb blob on the owner-updatable users row so
-- no new table or policies are needed — users_update_own (0005) already lets
-- the owner write their own row.

alter table public.users
  add column if not exists prefs jsonb not null default '{}'::jsonb;

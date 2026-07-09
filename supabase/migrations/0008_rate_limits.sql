-- 0008_rate_limits.sql
-- Server-side abuse protection for the AI writing-scoring endpoint (and any
-- future metered/paid feature). A single fixed-window counter table plus an
-- atomic increment function.
--
-- SECURITY MODEL:
--   * RLS is ENABLED and NO client policies are created, so anon/authenticated
--     roles can neither read nor write this table. It is touched exclusively by
--     the service role (which BYPASSES RLS) from trusted API routes, and by the
--     check_rate_limit() function which runs SECURITY DEFINER.
--   * The API route never trusts the client for identity; it derives the
--     rate-limit identifier (client IP) server-side.

-- ===========================================================================
-- Table
-- ===========================================================================
create table if not exists public.rate_limits (
  id            bigserial   primary key,
  bucket        text        not null,
  identifier    text        not null,
  window_start  timestamptz not null,
  count         int         not null default 0,
  unique (bucket, identifier, window_start)
);

-- Cheap lookups / housekeeping by age.
create index if not exists rate_limits_window_start_idx
  on public.rate_limits (window_start);

-- ===========================================================================
-- Atomic fixed-window check-and-increment
-- ===========================================================================
-- Floors "now" to the current window boundary, upserts the counter row and
-- increments it atomically (INSERT ... ON CONFLICT DO UPDATE ... RETURNING),
-- then returns TRUE if the request is still within the allowance (post-
-- increment count <= p_max) or FALSE if the caller has exceeded it.
--
-- Atomicity: the ON CONFLICT DO UPDATE takes a row lock, so concurrent callers
-- serialise on the (bucket, identifier, window_start) row and each observes a
-- distinct incremented count. No read-modify-write race.
create or replace function public.check_rate_limit(
  p_bucket         text,
  p_identifier     text,
  p_window_seconds int,
  p_max            int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count        int;
begin
  if p_window_seconds is null or p_window_seconds <= 0 then
    raise exception 'p_window_seconds must be a positive integer';
  end if;

  -- Floor the current epoch to the window boundary so every request in the same
  -- window maps to the same row.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (bucket, identifier, window_start, count)
  values (p_bucket, p_identifier, v_window_start, 1)
  on conflict (bucket, identifier, window_start)
    do update set count = public.rate_limits.count + 1
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

-- ===========================================================================
-- RLS: enabled, no client policies (service-role only).
-- ===========================================================================
alter table public.rate_limits enable row level security;

-- The function is invoked by the service role from the API route; keep EXECUTE
-- off the anon/authenticated roles so it can never be called from the browser.
revoke all on function public.check_rate_limit(text, text, int, int) from public;
revoke all on function public.check_rate_limit(text, text, int, int) from anon, authenticated;

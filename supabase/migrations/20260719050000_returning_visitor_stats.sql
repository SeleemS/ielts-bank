-- 20260719050000_returning_visitor_stats.sql
-- New-vs-returning visitors for the daily report.
--
-- returning_visitor_stats(p_start, p_end): among distinct visitors active in
-- [p_start, p_end), how many had ANY activity_events row before p_start.
-- Visitor identity mirrors the daily report: user_id when present, else
-- anon_id (anon_id is a persistent localStorage UUID, and /api/track
-- retro-links anon history to user_id at sign-in, so a signed-in visitor's
-- pre-signup history is found via user_id).
--
-- Cost: one small distinct-visitor scan over the day's window, then one
-- indexed EXISTS probe per visitor (activity_events_user_created_idx /
-- activity_events_anon_created_idx). activity_events is never purged
-- (cleanup cron touches rate_limits only), so the look-back is full-history.

create or replace function public.returning_visitor_stats(
  p_start timestamptz,
  p_end timestamptz
)
returns table (visitors bigint, returning_visitors bigint)
language sql
security definer
set search_path = ''
as $$
  with today as (
    select distinct on (coalesce(user_id::text, anon_id))
      user_id,
      anon_id
    from public.activity_events
    where created_at >= p_start
      and created_at < p_end
    order by coalesce(user_id::text, anon_id), created_at
  )
  select
    count(*)::bigint as visitors,
    count(*) filter (
      where exists (
        select 1
        from public.activity_events e
        where e.created_at < p_start
          and (
            (t.user_id is not null and e.user_id = t.user_id)
            or (t.user_id is null and e.anon_id = t.anon_id)
          )
      )
    )::bigint as returning_visitors
  from today t;
$$;

revoke all on function public.returning_visitor_stats(timestamptz, timestamptz) from public;
revoke all on function public.returning_visitor_stats(timestamptz, timestamptz) from anon, authenticated;
grant execute on function public.returning_visitor_stats(timestamptz, timestamptz) to service_role;

-- 20260724030000_realtime_visitor_names.sql
-- dashboard_realtime: feed rows and active-visitor rows now carry the
-- signed-in user's display_name (mirrored from signup full_name by
-- handle_new_user/handle_user_update), so the /data activity log can show
-- real names for signed-in users and aliases for everyone else.

create or replace function public.dashboard_realtime()
returns jsonb
language sql
security definer
set search_path = ''
as $$
with recent as (
  select *, coalesce(user_id::text, anon_id) as visitor, props->>'path' as path
  from public.activity_events
  where created_at > now() - interval '1 hour'
),
active as (
  select visitor,
    substr(md5(visitor), 1, 8) as vh,
    mode() within group (order by country) filter (where country is not null) as country,
    max(created_at) as last_seen,
    bool_or(user_id is not null) as signed_in,
    (array_agg(path order by created_at desc) filter (where path is not null))[1] as last_path,
    mode() within group (order by nullif(props->>'acquisition_source',''))
      filter (where nullif(props->>'acquisition_source','') is not null) as source,
    mode() within group (order by nullif(props->>'device',''))
      filter (where nullif(props->>'device','') is not null) as device,
    (select u.display_name from public.users u where u.id::text = recent.visitor limit 1) as name
  from recent
  where created_at > now() - interval '5 minutes'
  group by 1
),
per_minute as (
  select jsonb_agg(jsonb_build_object('t', t, 'events', events, 'visitors', visitors)
    order by t) as data
  from (
    select date_trunc('minute', created_at) as t,
      count(*) as events, count(distinct visitor) as visitors
    from recent group by 1
  ) m
),
feed as (
  select jsonb_agg(jsonb_build_object(
    'event', event, 'skill', skill, 'slug', slug, 'country', country,
    'path', path, 'signed_in', user_id is not null, 'at', created_at,
    'vh', substr(md5(visitor), 1, 8),
    'name', (select u.display_name from public.users u where u.id = f.user_id)
  ) order by created_at desc) as data
  from (
    select * from recent
    where event not in ('session_heartbeat', 'ui_interaction')
    order by created_at desc limit 40
  ) f
)
select jsonb_build_object(
  'active_now', (select count(*) from active),
  'active', coalesce((
    select jsonb_agg(jsonb_build_object(
      'vh', vh, 'c', country, 'path', last_path, 'signed_in', signed_in,
      'source', source, 'device', device, 'last_seen', last_seen, 'name', name
    ) order by last_seen desc) from active), '[]'::jsonb),
  'active_countries', coalesce((
    select jsonb_agg(jsonb_build_object('c', country, 'n', n, 'paths', paths) order by n desc)
    from (
      select country, count(*) as n,
        (array_agg(last_path) filter (where last_path is not null))[1:3] as paths
      from active where country is not null group by 1
    ) ac), '[]'::jsonb),
  'active_referrers', coalesce((
    select jsonb_agg(jsonb_build_object('label', coalesce(source, 'Direct'), 'n', n) order by n desc)
    from (select source, count(*) as n from active group by 1) r), '[]'::jsonb),
  'active_devices', coalesce((
    select jsonb_agg(jsonb_build_object('label', coalesce(device, 'Unknown'), 'n', n) order by n desc)
    from (select device, count(*) as n from active group by 1) d), '[]'::jsonb),
  'per_minute', coalesce((select data from per_minute), '[]'::jsonb),
  'feed', coalesce((select data from feed), '[]'::jsonb),
  'last_hour_events', (select count(*) from recent),
  'last_hour_visitors', (select count(distinct visitor) from recent),
  'registered_users', (select count(*) from public.users
                       where coalesce(is_anonymous, false) = false)
);
$$;

revoke all on function public.dashboard_realtime() from public;
revoke all on function public.dashboard_realtime() from anon, authenticated;
grant execute on function public.dashboard_realtime() to service_role;

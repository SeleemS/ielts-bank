-- 20260723210000_data_dashboard_stats.sql
-- Aggregation RPCs for the private /data analytics dashboard.
--
-- dashboard_overview(p_from, p_to, p_bucket): one jsonb payload with every
-- historical aggregate the dashboard renders (totals + prior-period totals,
-- bucketed time series, per-country rollup, funnel, top pages, engaged time
-- by area, acquisition, hour-of-week heatmap, session-length buckets).
-- p_bucket is 'hour' or 'day'.
--
-- dashboard_realtime(): the live slice — active sessions in the last 5
-- minutes (total and per country), events-per-minute for the last hour, and
-- the most recent event feed.
--
-- Visitor identity mirrors the daily report: coalesce(user_id::text, anon_id)
-- (/api/track retro-links anon history to user_id at sign-in). "Engaged
-- seconds" derives from session_heartbeat rows, which fire every 60s of
-- active use (see src/lib/sessionHeartbeat.js).
--
-- Service-role only, like every other analytics RPC.

create or replace function public.dashboard_overview(
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text default 'day'
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
with ev as (
  select *,
    coalesce(user_id::text, anon_id) as visitor,
    props->>'path' as path
  from public.activity_events
  where created_at >= p_from and created_at < p_to
),
prev as (
  select coalesce(user_id::text, anon_id) as visitor, event
  from public.activity_events
  where created_at >= p_from - (p_to - p_from) and created_at < p_from
),
totals as (
  select
    count(*) as events,
    count(distinct visitor) as visitors,
    count(distinct visitor) filter (where event = 'signup_verified') as signups,
    count(*) filter (where event in ('attempt_submit','writing_submit','speaking_submit')) as submits,
    count(*) filter (where event = 'purchase_success') as purchases,
    count(distinct session_id) filter (where event = 'login') as login_sessions,
    coalesce(sum((props->>'amount_minor')::numeric) filter (
      where event in ('subscription_activated','subscription_payment_succeeded')
        and props->>'amount_minor' ~ '^[0-9]+$'), 0) as revenue_minor
  from ev
),
prev_totals as (
  select
    count(*) as events,
    count(distinct visitor) as visitors,
    count(distinct visitor) filter (where event = 'signup_verified') as signups,
    count(*) filter (where event in ('attempt_submit','writing_submit','speaking_submit')) as submits,
    count(*) filter (where event = 'purchase_success') as purchases
  from prev
),
series as (
  select jsonb_agg(jsonb_build_object(
    't', t, 'events', events, 'visitors', visitors, 'submits', submits, 'signups', signups
  ) order by t) as data
  from (
    select date_trunc(case when p_bucket = 'hour' then 'hour' else 'day' end, created_at) as t,
      count(*) as events,
      count(distinct visitor) as visitors,
      count(*) filter (where event in ('attempt_submit','writing_submit','speaking_submit')) as submits,
      count(*) filter (where event = 'signup_verified') as signups
    from ev group by 1
  ) s
),
countries as (
  select jsonb_agg(jsonb_build_object(
    'c', country, 'events', events, 'visitors', visitors,
    'submits', submits, 'signups', signups, 'engaged_secs', engaged_secs
  ) order by visitors desc) as data
  from (
    select country,
      count(*) as events,
      count(distinct visitor) as visitors,
      count(*) filter (where event in ('attempt_submit','writing_submit','speaking_submit')) as submits,
      count(distinct visitor) filter (where event = 'signup_verified') as signups,
      count(*) filter (where event = 'session_heartbeat') * 60 as engaged_secs
    from ev where country is not null
    group by 1
  ) c
),
funnel as (
  select jsonb_build_object(
    'visited',       count(distinct visitor) filter (where event = 'page_view'),
    'engaged',       count(distinct visitor) filter (where event in
      ('question_open','attempt_start','question_answer','audio_play','estimator_start')),
    'submitted',     count(distinct visitor) filter (where event in
      ('attempt_submit','writing_submit','speaking_submit')),
    'signed_up',     count(distinct visitor) filter (where event in ('signup_verified','login')),
    'saw_gate',      count(distinct visitor) filter (where event in
      ('paywall_view','premium_gate','free_limit_gate','mock_paywall_shown')),
    'upgrade_click', count(distinct visitor) filter (where event = 'paywall_upgrade_click'),
    'checkout',      count(distinct visitor) filter (where event = 'checkout_start'),
    'purchased',     count(distinct visitor) filter (where event in
      ('purchase_success','subscription_activated'))
  ) as data
  from ev
),
top_pages as (
  select jsonb_agg(jsonb_build_object('path', path, 'views', views, 'visitors', visitors)
    order by views desc) as data
  from (
    select path, count(*) as views, count(distinct visitor) as visitors
    from ev where event = 'page_view' and path is not null
    group by 1 order by 2 desc limit 15
  ) p
),
areas as (
  select jsonb_agg(jsonb_build_object('area', area, 'secs', secs, 'sessions', sessions)
    order by secs desc) as data
  from (
    select case
        when path like '/readingquestion%' or path like '/reading%' then 'Reading'
        when path like '/listeningquestion%' then 'Listening'
        when path like '/writingquestion%' or path = '/ielts-writing-checker' then 'Writing'
        when path like '/speakingquestion%' or path = '/speaking-examiner' then 'Speaking'
        when path like '/mock%' then 'Mock tests'
        when path = '/band-estimator' then 'Band estimator'
        when path = '/' then 'Home'
        when path like '/pricing%' then 'Pricing'
        when path like '/dashboard%' then 'User dashboard'
        when path like '/blog%' then 'Blog'
        else 'Other' end as area,
      count(*) * 60 as secs,
      count(distinct session_id) as sessions
    from ev where event = 'session_heartbeat'
    group by 1
  ) a
),
acquisition as (
  select jsonb_agg(jsonb_build_object('source', source, 'visitors', visitors, 'signups', signups)
    order by visitors desc) as data
  from (
    select coalesce(nullif(props->>'acquisition_source',''), 'unknown') as source,
      count(distinct visitor) as visitors,
      count(distinct visitor) filter (where event = 'signup_verified') as signups
    from ev group by 1 order by 2 desc limit 10
  ) q
),
hour_heatmap as (
  select jsonb_agg(jsonb_build_object('dow', dow, 'hour', hour, 'events', events)) as data
  from (
    select extract(isodow from created_at)::int as dow,
      extract(hour from created_at)::int as hour,
      count(*) as events
    from ev group by 1, 2
  ) h
),
session_buckets as (
  select jsonb_agg(jsonb_build_object('bucket', bucket, 'sessions', n) order by bucket) as data
  from (
    select case
        when secs < 30 then '0'
        when secs < 180 then '1'
        when secs < 600 then '2'
        when secs < 1800 then '3'
        when secs < 3600 then '4'
        else '5' end as bucket,
      count(*) as n
    from (
      select session_id, extract(epoch from max(created_at) - min(created_at)) as secs
      from ev where session_id is not null group by session_id
    ) s
    group by 1
  ) b
),
returning_share as (
  select count(*) as visitors,
    count(*) filter (where exists (
      select 1 from public.activity_events e
      where e.created_at < p_from
        and coalesce(e.user_id::text, e.anon_id) = v.visitor
    )) as returning_visitors
  from (select distinct visitor from ev) v
)
select jsonb_build_object(
  'totals', (select row_to_json(totals)::jsonb from totals),
  'prev_totals', (select row_to_json(prev_totals)::jsonb from prev_totals),
  'series', coalesce((select data from series), '[]'::jsonb),
  'countries', coalesce((select data from countries), '[]'::jsonb),
  'funnel', (select data from funnel),
  'top_pages', coalesce((select data from top_pages), '[]'::jsonb),
  'areas', coalesce((select data from areas), '[]'::jsonb),
  'acquisition', coalesce((select data from acquisition), '[]'::jsonb),
  'hour_heatmap', coalesce((select data from hour_heatmap), '[]'::jsonb),
  'session_buckets', coalesce((select data from session_buckets), '[]'::jsonb),
  'returning', (select jsonb_build_object('visitors', visitors, 'returning', returning_visitors)
                from returning_share)
);
$$;

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
  select visitor, country,
    max(created_at) as last_seen,
    (array_agg(path order by created_at desc) filter (where path is not null))[1] as last_path
  from recent
  where created_at > now() - interval '5 minutes'
  group by 1, 2
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
    'path', path, 'signed_in', user_id is not null, 'at', created_at
  ) order by created_at desc) as data
  from (
    select * from recent
    where event not in ('session_heartbeat', 'ui_interaction')
    order by created_at desc limit 40
  ) f
)
select jsonb_build_object(
  'active_now', (select count(*) from active),
  'active_countries', coalesce((
    select jsonb_agg(jsonb_build_object('c', country, 'n', n, 'paths', paths) order by n desc)
    from (
      select country, count(*) as n,
        (array_agg(last_path) filter (where last_path is not null))[1:3] as paths
      from active where country is not null group by 1
    ) ac), '[]'::jsonb),
  'per_minute', coalesce((select data from per_minute), '[]'::jsonb),
  'feed', coalesce((select data from feed), '[]'::jsonb),
  'last_hour_events', (select count(*) from recent),
  'last_hour_visitors', (select count(distinct visitor) from recent)
);
$$;

revoke all on function public.dashboard_overview(timestamptz, timestamptz, text) from public;
revoke all on function public.dashboard_overview(timestamptz, timestamptz, text) from anon, authenticated;
grant execute on function public.dashboard_overview(timestamptz, timestamptz, text) to service_role;

revoke all on function public.dashboard_realtime() from public;
revoke all on function public.dashboard_realtime() from anon, authenticated;
grant execute on function public.dashboard_realtime() to service_role;

-- 20260724010000_restore_session_buckets.sql
-- Re-add session_buckets (session-duration histogram) to dashboard_overview;
-- the v1-style dashboard's Session length card renders it. Everything else
-- from the v3 RPCs is unchanged.

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
    props->>'path' as path,
    case when props->>'amount_minor' ~ '^[0-9]+$' then (props->>'amount_minor')::numeric
         when props->>'amount' ~ '^[0-9]+$' then (props->>'amount')::numeric
         else null end as pay_minor
  from public.activity_events
  where created_at >= p_from and created_at < p_to
),
pay as (
  select visitor, pay_minor from ev
  where event in ('subscription_activated','subscription_payment_succeeded')
    and pay_minor is not null
),
visitor_stats as (
  select e.visitor,
    count(*)::int as n,
    mode() within group (order by e.country) filter (where e.country is not null) as country,
    mode() within group (order by nullif(e.props->>'acquisition_source',''))
      filter (where nullif(e.props->>'acquisition_source','') is not null) as source,
    bool_or(e.event = 'signup_verified') as signed_up,
    coalesce((select sum(p.pay_minor) from pay p where p.visitor = e.visitor), 0) as revenue_minor
  from ev e group by 1
),
engaged as (select * from visitor_stats where n >= 3),
sessions as (
  select session_id,
    count(*) filter (where event = 'page_view')::int as page_views,
    extract(epoch from max(created_at) - min(created_at)) as secs
  from ev where session_id is not null group by 1
),
totals as (
  select
    (select count(*) from ev) as events,
    (select count(*) from visitor_stats) as visitors,
    (select count(*) from engaged) as engaged_visitors,
    (select count(*) from visitor_stats where signed_up) as signups,
    (select count(*) from ev where event in ('attempt_submit','writing_submit','speaking_submit')) as submits,
    (select count(*) from ev where event = 'purchase_success') as purchases,
    (select count(distinct visitor) from pay) as purchasers,
    (select count(*) from pay) as payments,
    (select count(distinct session_id) from ev where event = 'login') as login_sessions,
    (select coalesce(sum(pay_minor), 0) from pay) as revenue_minor,
    (select count(*) from sessions) as sessions_total,
    (select count(*) from sessions where page_views <= 1) as bounce_sessions,
    (select coalesce(percentile_cont(0.5) within group (order by secs), 0)::int
       from sessions where page_views >= 1) as median_session_secs
),
prev_totals as (
  select
    count(*) as events,
    count(distinct coalesce(user_id::text, anon_id)) as visitors,
    count(distinct coalesce(user_id::text, anon_id)) filter (where event = 'signup_verified') as signups,
    count(*) filter (where event in ('attempt_submit','writing_submit','speaking_submit')) as submits,
    count(*) filter (where event = 'purchase_success') as purchases,
    coalesce(sum(case when props->>'amount_minor' ~ '^[0-9]+$' then (props->>'amount_minor')::numeric
                      when props->>'amount' ~ '^[0-9]+$' then (props->>'amount')::numeric end)
      filter (where event in ('subscription_activated','subscription_payment_succeeded')), 0) as revenue_minor
  from public.activity_events
  where created_at >= p_from - (p_to - p_from) and created_at < p_from
),
series as (
  select jsonb_agg(jsonb_build_object(
    't', t, 'events', events, 'visitors', visitors, 'submits', submits,
    'signups', signups, 'revenue_minor', revenue_minor
  ) order by t) as data
  from (
    select date_trunc(case when p_bucket = 'hour' then 'hour' else 'day' end, created_at) as t,
      count(*) as events,
      count(distinct visitor) as visitors,
      count(*) filter (where event in ('attempt_submit','writing_submit','speaking_submit')) as submits,
      count(*) filter (where event = 'signup_verified') as signups,
      coalesce(sum(pay_minor) filter (where event in
        ('subscription_activated','subscription_payment_succeeded')), 0) as revenue_minor
    from ev group by 1
  ) s
),
countries as (
  select jsonb_agg(jsonb_build_object(
    'c', c.country, 'events', c.events, 'visitors', c.visitors,
    'engaged', coalesce(e.engaged, 0),
    'submits', c.submits, 'signups', c.signups, 'engaged_secs', c.engaged_secs,
    'revenue_minor', coalesce(e.revenue_minor, 0)
  ) order by coalesce(e.engaged, 0) desc, c.visitors desc) as data
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
  left join (
    select country, count(*)::int as engaged, sum(revenue_minor) as revenue_minor
    from engaged where country is not null group by 1
  ) e using (country)
),
referrers as (
  select jsonb_agg(jsonb_build_object(
    'label', source, 'visitors', visitors, 'revenue_minor', revenue_minor, 'signups', signups
  ) order by visitors desc) as data
  from (
    select coalesce(source, 'Direct/None') as source,
      count(*)::int as visitors,
      sum(revenue_minor) as revenue_minor,
      count(*) filter (where signed_up)::int as signups
    from engaged group by 1 order by 2 desc limit 8
  ) r
),
channels as (
  select jsonb_agg(jsonb_build_object(
    'label', channel, 'visitors', visitors, 'revenue_minor', revenue_minor, 'signups', signups
  ) order by visitors desc) as data
  from (
    select case
        when source is null or source in ('direct','unknown','') then 'Direct/None'
        when source ~* 'chatgpt|openai|perplexity|claude|gemini|copilot' then 'AI assistants'
        when source ~* 'google|bing|yahoo|yandex|duckduckgo|baidu|search' then 'Organic search'
        when source ~* 'facebook|instagram|twitter|linkedin|tiktok|zalo|telegram|whatsapp|reddit|youtube|t\.co|vk' then 'Social'
        else 'Referral' end as channel,
      count(*)::int as visitors,
      sum(revenue_minor) as revenue_minor,
      count(*) filter (where signed_up)::int as signups
    from engaged group by 1 order by 2 desc
  ) c
),
campaigns as (
  select jsonb_agg(jsonb_build_object('label', campaign, 'visitors', visitors)
    order by visitors desc) as data
  from (
    select nullif(props->>'utm_campaign','') as campaign,
      count(distinct visitor)::int as visitors
    from ev where nullif(props->>'utm_campaign','') is not null
    group by 1 order by 2 desc limit 8
  ) c
),
pages_top as (
  select jsonb_agg(jsonb_build_object('label', path, 'visitors', visitors, 'views', views)
    order by visitors desc) as data
  from (
    select path, count(distinct visitor)::int as visitors, count(*)::int as views
    from ev where event = 'page_view' and path is not null
    group by 1 order by 2 desc limit 8
  ) p
),
pages_entry as (
  select jsonb_agg(jsonb_build_object('label', path, 'visitors', n) order by n desc) as data
  from (
    select path, count(*)::int as n from (
      select distinct on (session_id) session_id, path
      from ev where event = 'page_view' and session_id is not null and path is not null
      order by session_id, created_at
    ) f group by 1 order by 2 desc limit 8
  ) p
),
pages_exit as (
  select jsonb_agg(jsonb_build_object('label', path, 'visitors', n) order by n desc) as data
  from (
    select path, count(*)::int as n from (
      select distinct on (session_id) session_id, path
      from ev where session_id is not null and path is not null
      order by session_id, created_at desc
    ) l group by 1 order by 2 desc limit 8
  ) p
),
ua_dims as (
  select
    (select jsonb_agg(jsonb_build_object('label', v, 'visitors', n) order by n desc)
     from (select coalesce(nullif(props->>'browser',''),'Unknown') v, count(distinct visitor)::int n
           from ev where event='page_view' group by 1 order by 2 desc limit 8) b) as browsers,
    (select jsonb_agg(jsonb_build_object('label', v, 'visitors', n) order by n desc)
     from (select coalesce(nullif(props->>'os',''),'Unknown') v, count(distinct visitor)::int n
           from ev where event='page_view' group by 1 order by 2 desc limit 8) o) as oses,
    (select jsonb_agg(jsonb_build_object('label', v, 'visitors', n) order by n desc)
     from (select coalesce(nullif(props->>'device',''),'Unknown') v, count(distinct visitor)::int n
           from ev where event='page_view' group by 1 order by 2 desc limit 8) d) as devices
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
      count(*)::int as n
    from sessions s
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
  'breakdowns', jsonb_build_object(
    'channels', coalesce((select data from channels), '[]'::jsonb),
    'referrers', coalesce((select data from referrers), '[]'::jsonb),
    'campaigns', coalesce((select data from campaigns), '[]'::jsonb),
    'pages_top', coalesce((select data from pages_top), '[]'::jsonb),
    'pages_entry', coalesce((select data from pages_entry), '[]'::jsonb),
    'pages_exit', coalesce((select data from pages_exit), '[]'::jsonb),
    'browsers', coalesce((select browsers from ua_dims), '[]'::jsonb),
    'oses', coalesce((select oses from ua_dims), '[]'::jsonb),
    'devices', coalesce((select devices from ua_dims), '[]'::jsonb)
  ),
  'funnel', (select data from funnel),
  'areas', coalesce((select data from areas), '[]'::jsonb),
  'hour_heatmap', coalesce((select data from hour_heatmap), '[]'::jsonb),
  'session_buckets', coalesce((select data from session_buckets), '[]'::jsonb),
  'returning', (select jsonb_build_object('visitors', visitors, 'returning', returning_visitors)
                from returning_share)
);
$$;

revoke all on function public.dashboard_overview(timestamptz, timestamptz, text) from public;
revoke all on function public.dashboard_overview(timestamptz, timestamptz, text) from anon, authenticated;
grant execute on function public.dashboard_overview(timestamptz, timestamptz, text) to service_role;

-- 20260723235000_datafast_dashboard_rpcs.sql
-- Dashboard RPC v3 for the DataFast-style /data redesign.
--
-- dashboard_overview additions (all prior keys kept):
--   totals: purchasers, payments, bounce_sessions/sessions_total,
--           median_session_secs, revenue_minor now reads props.amount_minor
--           OR props.amount (billing events store `amount`, in cents).
--   series: per-bucket revenue_minor.
--   breakdowns: channels / referrers / campaigns (engaged visitors + attributed
--   revenue), pages_top / pages_entry / pages_exit, devices / browsers / oses
--   (from page_view props captured client-side from Jul 24 on).
--   countries: adds attributed revenue_minor.
--   Revenue attribution: a purchaser's payments are attributed to their modal
--   acquisition source / country (visitor identity = coalesce(user_id, anon)).
--
-- dashboard_realtime additions:
--   active: one row per active visitor (country, last path, signed_in,
--           stable 8-char hash for anonymized alias/avatar seeds, last_seen).
--   tallies: referrers + devices of active visitors; feed rows gain 'vh' hash.
--
-- Service-role only, as before.

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
  select visitor,
    substr(md5(visitor), 1, 8) as vh,
    mode() within group (order by country) filter (where country is not null) as country,
    max(created_at) as last_seen,
    bool_or(user_id is not null) as signed_in,
    (array_agg(path order by created_at desc) filter (where path is not null))[1] as last_path,
    mode() within group (order by nullif(props->>'acquisition_source',''))
      filter (where nullif(props->>'acquisition_source','') is not null) as source,
    mode() within group (order by nullif(props->>'device',''))
      filter (where nullif(props->>'device','') is not null) as device
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
    'vh', substr(md5(visitor), 1, 8)
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
      'source', source, 'device', device, 'last_seen', last_seen
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
  'last_hour_visitors', (select count(distinct visitor) from recent)
);
$$;

revoke all on function public.dashboard_overview(timestamptz, timestamptz, text) from public;
revoke all on function public.dashboard_overview(timestamptz, timestamptz, text) from anon, authenticated;
grant execute on function public.dashboard_overview(timestamptz, timestamptz, text) to service_role;

revoke all on function public.dashboard_realtime() from public;
revoke all on function public.dashboard_realtime() from anon, authenticated;
grant execute on function public.dashboard_realtime() to service_role;

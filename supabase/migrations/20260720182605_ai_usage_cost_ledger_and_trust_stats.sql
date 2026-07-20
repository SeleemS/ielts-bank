-- AI unit economics, multi-period fair-use controls, and public aggregate
-- trust statistics. Provider prices are snapshotted on every ledger row so a
-- later price change never rewrites historical costs.

-- ---------------------------------------------------------------------------
-- Cost ledger: service-role only, append-only from the application.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage_costs (
  id                         bigint generated always as identity primary key,
  user_id                    uuid not null references auth.users(id) on delete cascade,
  skill                      text not null check (skill in ('writing', 'speaking')),
  feature                    text not null,
  operation                  text not null,
  provider                   text not null default 'openai',
  model                      text not null,
  provider_request_id        text,
  input_tokens               bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens        bigint not null default 0 check (
    cached_input_tokens >= 0 and cached_input_tokens <= input_tokens
  ),
  output_tokens              bigint not null default 0 check (output_tokens >= 0),
  audio_seconds              numeric(12,3) not null default 0 check (audio_seconds >= 0),
  cost_usd                   numeric(14,8) check (cost_usd >= 0),
  pricing_known              boolean not null default false,
  estimated                  boolean not null default false,
  succeeded                  boolean not null default true,
  input_rate_per_million     numeric(14,6),
  cached_input_rate_per_million numeric(14,6),
  output_rate_per_million    numeric(14,6),
  audio_rate_per_minute      numeric(14,6),
  metadata                   jsonb not null default '{}'::jsonb,
  occurred_at                timestamptz not null default now()
);

create unique index if not exists ai_usage_costs_provider_request_key
  on public.ai_usage_costs (provider, operation, provider_request_id)
  where provider_request_id is not null;
create index if not exists ai_usage_costs_user_time_idx
  on public.ai_usage_costs (user_id, occurred_at desc);
create index if not exists ai_usage_costs_feature_time_idx
  on public.ai_usage_costs (skill, feature, occurred_at desc);

alter table public.ai_usage_costs enable row level security;
revoke all on table public.ai_usage_costs
  from public, anon, authenticated, service_role;
grant select, insert on table public.ai_usage_costs to service_role;
grant usage, select on sequence public.ai_usage_costs_id_seq to service_role;

create or replace view public.ai_usage_cost_daily
with (security_invoker = true)
as
select
  (occurred_at at time zone 'utc')::date as usage_day,
  user_id,
  skill,
  feature,
  operation,
  model,
  count(*) as call_count,
  coalesce(sum(cost_usd) filter (where pricing_known), 0)::numeric(14,8) as known_cost_usd,
  count(*) filter (where not pricing_known) as unpriced_requests,
  count(*) filter (where estimated) as estimated_requests,
  sum(input_tokens) as input_tokens,
  sum(cached_input_tokens) as cached_input_tokens,
  sum(output_tokens) as output_tokens,
  sum(audio_seconds)::numeric(14,3) as audio_seconds
from public.ai_usage_costs
group by 1, 2, 3, 4, 5, 6;

create or replace view public.ai_usage_cost_totals
with (security_invoker = true)
as
select
  user_id,
  skill,
  feature,
  operation,
  model,
  count(*) as call_count,
  coalesce(sum(cost_usd) filter (where pricing_known), 0)::numeric(14,8) as known_cost_usd,
  count(*) filter (where not pricing_known) as unpriced_requests,
  count(*) filter (where estimated) as estimated_requests,
  sum(input_tokens) as input_tokens,
  sum(cached_input_tokens) as cached_input_tokens,
  sum(output_tokens) as output_tokens,
  sum(audio_seconds)::numeric(14,3) as audio_seconds
from public.ai_usage_costs
group by 1, 2, 3, 4, 5;

revoke all on table public.ai_usage_cost_daily
  from public, anon, authenticated, service_role;
revoke all on table public.ai_usage_cost_totals
  from public, anon, authenticated, service_role;
grant select on table public.ai_usage_cost_daily to service_role;
grant select on table public.ai_usage_cost_totals to service_role;

comment on table public.ai_usage_costs is
  'Append-only per-user/per-feature AI usage with historical provider price snapshots.';
comment on view public.ai_usage_cost_daily is
  'Service-role daily AI costs grouped by user, skill, feature, operation, and model.';
comment on view public.ai_usage_cost_totals is
  'Service-role lifetime AI costs grouped by user, skill, feature, operation, and model.';

-- ---------------------------------------------------------------------------
-- Public trust aggregate. No row-level event or user data is returned.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_trust_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'questionsAnswered',
    count(*)
  )
  from (
    -- Text/radio changes can emit more than once. Count a question only once
    -- per study session and passage; fall back to the event id when older
    -- telemetry lacks one of those dimensions.
    select distinct
      coalesce(session_id::text, id::text) as session_key,
      coalesce(slug, '') as passage_key,
      coalesce(props ->> 'question_number', id::text) as question_key
    from public.activity_events
    where event = 'question_answer'
      and coalesce(props ->> 'answered', 'true') <> 'false'
  ) answered_questions;
$$;

revoke all on function public.get_public_trust_stats() from public;
grant execute on function public.get_public_trust_stats() to anon, authenticated, service_role;
comment on function public.get_public_trust_stats() is
  'Aggregate-only public trust signal; never exposes activity event rows or user identifiers.';

-- ---------------------------------------------------------------------------
-- Fair-use counters: UTC day, ISO week (Monday), and calendar month.
-- Premium limits: Writing 2/day, 10/week, 30/month.
--                 Speaking 1/day, 5/week, 15/month.
-- ---------------------------------------------------------------------------
alter table public.user_quotas
  add column if not exists weekly_counters_start date,
  add column if not exists writing_scores_week int not null default 0 check (writing_scores_week >= 0),
  add column if not exists speaking_scores_week int not null default 0 check (speaking_scores_week >= 0),
  add column if not exists monthly_counters_start date,
  add column if not exists writing_scores_month int not null default 0 check (writing_scores_month >= 0),
  add column if not exists speaking_scores_month int not null default 0 check (speaking_scores_month >= 0);

create or replace function public.consume_ai_score(p_uid uuid, p_skill text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quota public.user_quotas%rowtype;
  v_plan text;
  v_status text;
  v_renews timestamptz;
  v_expires timestamptz;
  v_pause_until timestamptz;
  v_is_anonymous boolean := false;
  v_premium boolean := false;
  v_daily_cap int;
  v_weekly_cap int;
  v_monthly_cap int;
  v_daily_used int;
  v_weekly_used int;
  v_monthly_used int;
  v_today date := (now() at time zone 'utc')::date;
  v_week_start date := date_trunc('week', now() at time zone 'utc')::date;
  v_month_start date := date_trunc('month', now() at time zone 'utc')::date;
  v_tomorrow timestamptz := date_trunc('day', now() at time zone 'utc') + interval '1 day';
  v_next_week timestamptz := date_trunc('week', now() at time zone 'utc') + interval '1 week';
  v_next_month timestamptz := date_trunc('month', now() at time zone 'utc') + interval '1 month';
  v_now timestamptz := now();
begin
  if p_uid is null or (
    (select auth.uid()) is distinct from p_uid
    and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role'
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_skill not in ('writing', 'speaking') then
    raise exception 'unknown skill %', p_skill;
  end if;

  insert into public.users (id, email, is_anonymous)
  select
    u.id,
    u.email,
    coalesce((u.raw_user_meta_data ->> 'is_anonymous')::boolean, u.email is null)
  from auth.users u
  where u.id = p_uid
  on conflict (id) do nothing;

  select
    coalesce(to_jsonb(u)->>'plan', 'free'),
    coalesce(to_jsonb(u)->>'plan_status', 'inactive'),
    (to_jsonb(u)->>'plan_renews_at')::timestamptz,
    (to_jsonb(u)->>'plan_expires_at')::timestamptz,
    (to_jsonb(u)->>'billing_pause_until')::timestamptz,
    u.is_anonymous
  into v_plan, v_status, v_renews, v_expires, v_pause_until, v_is_anonymous
  from public.users u
  where u.id = p_uid;

  if v_is_anonymous then
    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'resetsAt', null,
      'plan', 'free', 'free', false, 'reason', 'account_required'
    );
  end if;

  v_premium := (
    case
      when v_expires is not null then v_expires > v_now
      else v_plan in ('premium', 'pro', 'paid') and (
        v_status in ('active', 'trialing', 'past_due')
        or (v_status = 'canceled' and coalesce(v_renews, v_now) > v_now)
      )
    end
  ) and coalesce(v_pause_until, '-infinity'::timestamptz) <= v_now;

  insert into public.user_quotas (user_id, ai_scores_remaining, period_resets_at)
  values (p_uid, 0, null)
  on conflict (user_id) do nothing;

  select * into v_quota
  from public.user_quotas
  where user_id = p_uid
  for update;

  if not v_premium then
    if p_skill <> 'writing' or v_quota.free_writing_score_used_at is not null then
      return jsonb_build_object(
        'allowed', false, 'remaining', 0, 'resetsAt', null,
        'plan', 'free', 'free', false, 'reason', 'premium_required'
      );
    end if;
    update public.user_quotas
    set free_writing_score_used_at = v_now
    where user_id = p_uid;
    return jsonb_build_object(
      'allowed', true, 'remaining', 0, 'resetsAt', null,
      'plan', 'free', 'free', true, 'consumedAt', v_now
    );
  end if;

  if v_quota.daily_counters_date is distinct from v_today then
    update public.user_quotas
    set writing_scores_today = 0,
        speaking_scores_today = 0,
        daily_counters_date = v_today
    where user_id = p_uid
    returning * into v_quota;
  end if;
  if v_quota.weekly_counters_start is distinct from v_week_start then
    update public.user_quotas
    set writing_scores_week = 0,
        speaking_scores_week = 0,
        weekly_counters_start = v_week_start
    where user_id = p_uid
    returning * into v_quota;
  end if;
  if v_quota.monthly_counters_start is distinct from v_month_start then
    update public.user_quotas
    set writing_scores_month = 0,
        speaking_scores_month = 0,
        monthly_counters_start = v_month_start
    where user_id = p_uid
    returning * into v_quota;
  end if;

  v_daily_cap := case p_skill when 'speaking' then 1 else 2 end;
  v_weekly_cap := case p_skill when 'speaking' then 5 else 10 end;
  v_monthly_cap := case p_skill when 'speaking' then 15 else 30 end;
  v_daily_used := case p_skill
    when 'speaking' then v_quota.speaking_scores_today
    else v_quota.writing_scores_today end;
  v_weekly_used := case p_skill
    when 'speaking' then v_quota.speaking_scores_week
    else v_quota.writing_scores_week end;
  v_monthly_used := case p_skill
    when 'speaking' then v_quota.speaking_scores_month
    else v_quota.writing_scores_month end;

  if v_daily_used >= v_daily_cap then
    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'resetsAt', v_tomorrow,
      'plan', 'premium', 'free', false, 'reason', 'daily_cap',
      'limitPeriod', 'day', 'limit', v_daily_cap
    );
  end if;
  if v_weekly_used >= v_weekly_cap then
    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'resetsAt', v_next_week,
      'plan', 'premium', 'free', false, 'reason', 'weekly_cap',
      'limitPeriod', 'week', 'limit', v_weekly_cap
    );
  end if;
  if v_monthly_used >= v_monthly_cap then
    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'resetsAt', v_next_month,
      'plan', 'premium', 'free', false, 'reason', 'monthly_cap',
      'limitPeriod', 'month', 'limit', v_monthly_cap
    );
  end if;

  if p_skill = 'speaking' then
    update public.user_quotas
    set speaking_scores_today = speaking_scores_today + 1,
        speaking_scores_week = speaking_scores_week + 1,
        speaking_scores_month = speaking_scores_month + 1
    where user_id = p_uid;
  else
    update public.user_quotas
    set writing_scores_today = writing_scores_today + 1,
        writing_scores_week = writing_scores_week + 1,
        writing_scores_month = writing_scores_month + 1
    where user_id = p_uid;
  end if;

  return jsonb_build_object(
    'allowed', true,
    'remaining', least(
      v_daily_cap - v_daily_used - 1,
      v_weekly_cap - v_weekly_used - 1,
      v_monthly_cap - v_monthly_used - 1
    ),
    'dailyRemaining', v_daily_cap - v_daily_used - 1,
    'weeklyRemaining', v_weekly_cap - v_weekly_used - 1,
    'monthlyRemaining', v_monthly_cap - v_monthly_used - 1,
    'resetsAt', v_tomorrow,
    'plan', 'premium', 'free', false, 'consumedAt', v_now
  );
end;
$$;

revoke all on function public.consume_ai_score(uuid, text)
  from public, anon, authenticated;
grant execute on function public.consume_ai_score(uuid, text) to service_role;
comment on function public.consume_ai_score(uuid, text) is
  'consume_ai_score v7: lifetime free Writing sample plus UTC day/week/month Premium caps.';

create or replace function public.refund_ai_score(
  p_uid uuid,
  p_skill text,
  p_free boolean,
  p_consumed_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_affected int := 0;
  v_consumed_day date := (p_consumed_at at time zone 'utc')::date;
  v_consumed_week date := date_trunc('week', p_consumed_at at time zone 'utc')::date;
  v_consumed_month date := date_trunc('month', p_consumed_at at time zone 'utc')::date;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_uid is null
    or p_consumed_at is null
    or p_free is null
    or p_skill not in ('writing', 'speaking')
    or (p_free and p_skill <> 'writing')
  then
    return false;
  end if;

  insert into public.ai_score_refunds (user_id, skill, consumed_at, free)
  values (p_uid, p_skill, p_consumed_at, p_free)
  on conflict (user_id, skill, consumed_at) do nothing;
  get diagnostics v_affected = row_count;
  if v_affected = 0 then return false; end if;

  if p_free then
    update public.user_quotas
    set free_writing_score_used_at = null
    where user_id = p_uid
      and free_writing_score_used_at = p_consumed_at;
  elsif p_skill = 'writing' then
    update public.user_quotas
    set writing_scores_today = case
          when daily_counters_date = v_consumed_day
          then greatest(writing_scores_today - 1, 0) else writing_scores_today end,
        writing_scores_week = case
          when weekly_counters_start = v_consumed_week
          then greatest(writing_scores_week - 1, 0) else writing_scores_week end,
        writing_scores_month = case
          when monthly_counters_start = v_consumed_month
          then greatest(writing_scores_month - 1, 0) else writing_scores_month end
    where user_id = p_uid;
  else
    update public.user_quotas
    set speaking_scores_today = case
          when daily_counters_date = v_consumed_day
          then greatest(speaking_scores_today - 1, 0) else speaking_scores_today end,
        speaking_scores_week = case
          when weekly_counters_start = v_consumed_week
          then greatest(speaking_scores_week - 1, 0) else speaking_scores_week end,
        speaking_scores_month = case
          when monthly_counters_start = v_consumed_month
          then greatest(speaking_scores_month - 1, 0) else speaking_scores_month end
    where user_id = p_uid;
  end if;

  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception 'consumed score not found for refund' using errcode = 'P0002';
  end if;
  return true;
end;
$$;

revoke all on function public.refund_ai_score(uuid, text, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.refund_ai_score(uuid, text, boolean, timestamptz)
  to service_role;

create or replace function public.consume_ai_score(p_uid uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.consume_ai_score(p_uid, 'writing');
$$;
revoke all on function public.consume_ai_score(uuid)
  from public, anon, authenticated;
grant execute on function public.consume_ai_score(uuid) to service_role;

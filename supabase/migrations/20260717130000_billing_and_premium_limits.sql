-- 20260717130000_billing_and_premium_limits.sql
-- Stripe billing columns + premium fair-use limits + Realtime examiner meter.
-- See docs/MONETIZATION.md §4.2, §5.3, §9.3 (2026-07-17 decision: Stripe, not Paddle).
--
--   * users:       plan / plan_status / plan_renews_at / plan_started_at /
--                  stripe_customer_id / stripe_subscription_id
--                  — writable ONLY by service_role (BEFORE UPDATE trigger guard;
--                  the 0005 owner-update RLS policy stays for profile fields).
--   * user_quotas: premium daily counters (writing 2/day, speaking 1/day) and
--                  the Realtime-examiner seconds meter.
--   * consume_ai_score(p_uid, p_skill): v2 of the 20260717020310 RPC — free
--     30-day meter unchanged; premium hits per-skill daily caps instead.
--     The old 1-arg signature is kept as a delegating wrapper so any deployed
--     code keeps working during rollout.
--   * consume_realtime_seconds(p_uid, p_seconds): decrements the Realtime
--     meter; refills from realtime_seconds_quota every 30 days. Premium only.

-- ---------------------------------------------------------------------------
-- users: billing columns
-- ---------------------------------------------------------------------------
alter table public.users
  add column if not exists plan                   text not null default 'free',
  add column if not exists plan_status            text not null default 'inactive',
  add column if not exists plan_renews_at         timestamptz,
  add column if not exists plan_started_at        timestamptz,
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text;

create unique index if not exists users_stripe_customer_id_key
  on public.users (stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists users_stripe_subscription_id_key
  on public.users (stripe_subscription_id) where stripe_subscription_id is not null;

-- Guard: only the service role (or direct admin connections) may change
-- billing columns. The client keeps its 0005 update policy for profile fields
-- (display_name, target_band, ...), but any attempt to touch plan*/stripe_*
-- through PostgREST as `authenticated` is rejected here.
create or replace function public.protect_billing_columns()
returns trigger
language plpgsql
as $$
begin
  if (
    new.plan                   is distinct from old.plan or
    new.plan_status            is distinct from old.plan_status or
    new.plan_renews_at         is distinct from old.plan_renews_at or
    new.plan_started_at        is distinct from old.plan_started_at or
    new.stripe_customer_id     is distinct from old.stripe_customer_id or
    new.stripe_subscription_id is distinct from old.stripe_subscription_id
  ) and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'billing columns are service-role only' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists users_protect_billing on public.users;
create trigger users_protect_billing
  before update on public.users
  for each row execute function public.protect_billing_columns();

-- ---------------------------------------------------------------------------
-- user_quotas: premium daily counters + Realtime meter
-- ---------------------------------------------------------------------------
alter table public.user_quotas
  add column if not exists writing_scores_today       int not null default 0,
  add column if not exists speaking_scores_today      int not null default 0,
  add column if not exists daily_counters_date        date,
  add column if not exists realtime_seconds_quota     int not null default 0,
  add column if not exists realtime_seconds_remaining int not null default 0,
  add column if not exists realtime_period_resets_at  timestamptz;

-- ---------------------------------------------------------------------------
-- consume_ai_score v2: per-skill, premium-aware.
--   free tier    : 3 scores / rolling 30 days (unchanged from 20260717020310)
--   premium tier : writing 2/day, speaking 1/day (fair-use abuse caps)
-- Returns jsonb: { allowed, remaining, resetsAt, plan, reason? }
-- ---------------------------------------------------------------------------
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
  v_premium boolean := false;
  v_cap int;
  v_used int;
  v_today date := (now() at time zone 'utc')::date;
  v_tomorrow timestamptz := date_trunc('day', now() at time zone 'utc') + interval '1 day';
  v_now timestamptz := now();
begin
  if p_uid is null or (
    auth.uid() is distinct from p_uid
    and coalesce(auth.role(), '') <> 'service_role'
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_skill not in ('writing', 'speaking') then
    raise exception 'unknown skill %', p_skill;
  end if;

  select coalesce(to_jsonb(u)->>'plan', 'free'),
         coalesce(to_jsonb(u)->>'plan_status', 'inactive'),
         (to_jsonb(u)->>'plan_renews_at')::timestamptz
    into v_plan, v_status, v_renews
  from public.users u where u.id = p_uid;

  v_premium := v_plan in ('premium', 'pro', 'paid') and (
    v_status in ('active', 'trialing', 'past_due')
    or (v_status = 'canceled' and coalesce(v_renews, v_now) > v_now)
  );

  insert into public.user_quotas (user_id, ai_scores_remaining, period_resets_at)
  values (p_uid, 3, v_now + interval '30 days')
  on conflict (user_id) do nothing;

  select * into v_quota from public.user_quotas where user_id = p_uid for update;

  if v_premium then
    -- roll the daily counters
    if v_quota.daily_counters_date is distinct from v_today then
      update public.user_quotas
      set writing_scores_today = 0,
          speaking_scores_today = 0,
          daily_counters_date = v_today
      where user_id = p_uid
      returning * into v_quota;
    end if;

    v_cap  := case p_skill when 'speaking' then 1 else 2 end;
    v_used := case p_skill when 'speaking' then v_quota.speaking_scores_today
                           else v_quota.writing_scores_today end;

    if v_used >= v_cap then
      return jsonb_build_object(
        'allowed', false, 'remaining', 0, 'resetsAt', v_tomorrow,
        'plan', 'premium', 'reason', 'daily_cap');
    end if;

    if p_skill = 'speaking' then
      update public.user_quotas
      set speaking_scores_today = speaking_scores_today + 1
      where user_id = p_uid;
    else
      update public.user_quotas
      set writing_scores_today = writing_scores_today + 1
      where user_id = p_uid;
    end if;

    return jsonb_build_object(
      'allowed', true, 'remaining', v_cap - v_used - 1, 'resetsAt', v_tomorrow,
      'plan', 'premium');
  end if;

  -- free tier: rolling 30-day meter (unchanged)
  if v_quota.period_resets_at is null or v_quota.period_resets_at <= v_now then
    update public.user_quotas
    set ai_scores_remaining = 3,
        period_resets_at = v_now + interval '30 days'
    where user_id = p_uid
    returning * into v_quota;
  end if;

  if v_quota.ai_scores_remaining <= 0 then
    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'resetsAt', v_quota.period_resets_at,
      'plan', 'free', 'reason', 'quota_exceeded');
  end if;

  update public.user_quotas
  set ai_scores_remaining = ai_scores_remaining - 1
  where user_id = p_uid
  returning * into v_quota;

  return jsonb_build_object(
    'allowed', true, 'remaining', v_quota.ai_scores_remaining,
    'resetsAt', v_quota.period_resets_at, 'plan', 'free');
end;
$$;

-- Backward-compatible wrapper: old deployed code calls the 1-arg form.
create or replace function public.consume_ai_score(p_uid uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.consume_ai_score(p_uid, 'writing');
$$;

revoke all on function public.consume_ai_score(uuid, text) from public, anon;
revoke all on function public.consume_ai_score(uuid) from public, anon;
grant execute on function public.consume_ai_score(uuid, text) to authenticated, service_role;
grant execute on function public.consume_ai_score(uuid) to authenticated, service_role;

comment on function public.consume_ai_score(uuid, text) is
  'Atomically consumes one AI-scoring credit: free tier = 3 per rolling 30 days; premium = per-skill daily fair-use caps (writing 2/day, speaking 1/day).';

-- ---------------------------------------------------------------------------
-- consume_realtime_seconds: Realtime-examiner minutes meter (§9.3).
-- Called by the session-mint route BEFORE creating an ephemeral OpenAI token.
-- Refills to realtime_seconds_quota every 30 days (quota value is set by the
-- Stripe webhook on activation/renewal: 3600 global, 1800 PPP; 0 = no access).
-- ---------------------------------------------------------------------------
create or replace function public.consume_realtime_seconds(p_uid uuid, p_seconds int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quota public.user_quotas%rowtype;
  v_now timestamptz := now();
begin
  if p_uid is null or (
    auth.uid() is distinct from p_uid
    and coalesce(auth.role(), '') <> 'service_role'
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_seconds is null or p_seconds <= 0 or p_seconds > 3600 then
    raise exception 'invalid seconds %', p_seconds;
  end if;

  select * into v_quota from public.user_quotas where user_id = p_uid for update;
  if v_quota.user_id is null then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'reason', 'no_quota_row');
  end if;

  if v_quota.realtime_seconds_quota <= 0 then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'reason', 'not_premium');
  end if;

  if v_quota.realtime_period_resets_at is null or v_quota.realtime_period_resets_at <= v_now then
    update public.user_quotas
    set realtime_seconds_remaining = realtime_seconds_quota,
        realtime_period_resets_at = v_now + interval '30 days'
    where user_id = p_uid
    returning * into v_quota;
  end if;

  if v_quota.realtime_seconds_remaining < p_seconds then
    return jsonb_build_object(
      'allowed', false, 'remaining', v_quota.realtime_seconds_remaining,
      'resetsAt', v_quota.realtime_period_resets_at, 'reason', 'minutes_exhausted');
  end if;

  update public.user_quotas
  set realtime_seconds_remaining = realtime_seconds_remaining - p_seconds
  where user_id = p_uid
  returning * into v_quota;

  return jsonb_build_object(
    'allowed', true, 'remaining', v_quota.realtime_seconds_remaining,
    'resetsAt', v_quota.realtime_period_resets_at);
end;
$$;

revoke all on function public.consume_realtime_seconds(uuid, int) from public, anon;
grant execute on function public.consume_realtime_seconds(uuid, int) to authenticated, service_role;

comment on function public.consume_realtime_seconds(uuid, int) is
  'Atomically decrements the Realtime-examiner seconds meter; 30-day refill from realtime_seconds_quota (set by the Stripe webhook per plan tier).';

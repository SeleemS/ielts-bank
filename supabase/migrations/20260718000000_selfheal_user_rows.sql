-- 20260718000000_selfheal_user_rows.sql
-- Fix: auth users whose public.users mirror row was deleted (e.g. removed via
-- the dashboard Table Editor instead of Auth) hit a foreign-key violation in
-- consume_ai_score's user_quotas upsert -> every AI score attempt 503s.
--
-- 1. Backfill: recreate the mirror row (and quota row) for any orphaned auth
--    user, exactly as the 0006 signup trigger would have.
-- 2. Self-heal: consume_ai_score now recreates a missing users row on the fly
--    before touching user_quotas, so a deleted mirror row can never break
--    scoring again.

-- ---------------------------------------------------------------------------
-- 1. Backfill orphaned auth users.
-- ---------------------------------------------------------------------------
insert into public.users (id, email, is_anonymous)
select u.id, u.email, false
from auth.users u
left join public.users p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

insert into public.user_quotas (user_id)
select u.id
from auth.users u
left join public.user_quotas q on q.user_id = u.id
where q.user_id is null
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. consume_ai_score v3: identical to v2 (20260717130000) plus the users
--    self-heal insert before the quota upsert.
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

  -- Self-heal: if the public.users mirror row is missing (deleted out-of-band),
  -- recreate it from auth.users so the quota FK below cannot fail.
  insert into public.users (id, email, is_anonymous)
  select u.id, u.email, false
  from auth.users u
  where u.id = p_uid
  on conflict (id) do nothing;

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

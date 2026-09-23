-- supabase/rollbacks/20260923120000_weekly_free_ai_score.down.sql
-- ROLLBACK for supabase/migrations/20260923120000_weekly_free_ai_score.sql.
-- Restores consume_ai_score v9 (lifetime free samples) VERBATIM from
-- supabase/migrations/20260802220000_referral_program.sql. Nothing else in
-- that file is re-run, so later changes to other functions stay intact.
--
-- Kept OUT of supabase/migrations on purpose so no migration runner ever
-- applies it forward. Apply with:
--   node scripts/apply-weekly-free-score.mjs --rollback
--
-- Effect: an account that has taken any free sample (weekly or lifetime) is
-- locked out of that skill's free sample again for good; accounts that never
-- used one keep it. No rows are changed, only the function body.

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
    if p_skill = 'writing' and v_quota.free_writing_score_used_at is null then
      update public.user_quotas
      set free_writing_score_used_at = v_now
      where user_id = p_uid;
      return jsonb_build_object(
        'allowed', true, 'remaining', 0, 'resetsAt', null,
        'plan', 'free', 'free', true, 'consumedAt', v_now
      );
    end if;
    if p_skill = 'speaking' and v_quota.free_speaking_score_used_at is null then
      update public.user_quotas
      set free_speaking_score_used_at = v_now
      where user_id = p_uid;
      return jsonb_build_object(
        'allowed', true, 'remaining', 0, 'resetsAt', null,
        'plan', 'free', 'free', true, 'consumedAt', v_now
      );
    end if;
    if coalesce(v_quota.referral_bonus_scores, 0) > 0 then
      update public.user_quotas
      set referral_bonus_scores = referral_bonus_scores - 1
      where user_id = p_uid;
      return jsonb_build_object(
        'allowed', true, 'remaining', v_quota.referral_bonus_scores - 1,
        'resetsAt', null, 'plan', 'free', 'free', false,
        'referral', true, 'consumedAt', v_now
      );
    end if;
    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'resetsAt', null,
      'plan', 'free', 'free', false, 'reason', 'premium_required'
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
  'consume_ai_score v9: lifetime free samples, then referral bonus credits, then Premium UTC caps.';

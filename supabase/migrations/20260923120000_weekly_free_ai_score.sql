-- 20260923120000_weekly_free_ai_score.sql
-- consume_ai_score v10: the free AI sample REFILLS. A signed-in free account
-- gets one reduced AI Writing score and one reduced AI Speaking score per
-- ROLLING 7 days, instead of one of each per lifetime (growth plan
-- 2026-09-23, monetization action #5). Competitors give 2-3 per month or
-- weekly credits; a weekly refill gives a free learner a reason to come back
-- and meet the paywall again.
--
-- What changes (and only this):
--   * free-sample eligibility per skill is now
--       free_<skill>_score_used_at IS NULL
--       OR free_<skill>_score_used_at <= now() - interval '7 days'
--     (was: IS NULL). Consuming stamps the column with now(), exactly as
--     before, so the existing column IS the period marker — no new column,
--     no backfill, no table rewrite.
--   * responses carry two extra, optional keys: 'freePeriod' ('week') and
--     'nextFreeAt' (when this skill's free sample refills). A free-tier
--     premium_required denial now also sets 'resetsAt' to that refill time
--     (it was always null). Every existing caller passes resetsAt straight
--     through on 402 and only reads it on the Premium fair-use branch, so old
--     app code ignores it safely.
--
-- Unchanged guarantees:
--   * signature (uuid, text) -> jsonb, SECURITY DEFINER, empty search_path,
--     service_role-only EXECUTE;
--   * atomicity: the user_quotas row is locked FOR UPDATE before the
--     eligibility check, so two concurrent requests cannot both take the
--     same week's sample;
--   * anonymous accounts are refused ('account_required'); the API routes
--     additionally reject anonymous / email-less JWTs before calling this;
--   * order for free accounts: free sample for this skill -> referral bonus
--     credit (either skill) -> 'premium_required'. Referral credits are only
--     spent when this week's sample for the skill is already used;
--   * Premium day/week/month caps are byte-for-byte those of v9;
--   * refund_ai_score v4 is NOT changed: a refund of a free score clears the
--     column only when it still equals the consumed timestamp. Clearing to
--     NULL is exactly right under the weekly rule too — the account was
--     eligible at the moment it consumed, so "eligible again" is the state
--     the refund must restore.
--
-- Deploy-order safety: this only replaces one function body. Old app code
-- (lifetime copy) keeps working: a user whose sample is > 7 days old is
-- simply granted another reduced free report when they submit. New app code
-- without this migration keeps the lifetime behaviour because the copy flag
-- (NEXT_PUBLIC_FREE_SCORE_PERIOD) defaults to lifetime and the server still
-- decides entitlement.
--
-- One-off effect on apply: every account whose lifetime sample is older
-- than 7 days becomes eligible again immediately. That is intended (a
-- reactivation hook). The per-IP limiters and the global daily circuit
-- breakers in /api/score/writing (500/day) and /api/score/speaking
-- (300/day) still cap the burst.
--
-- Rollback: supabase/rollbacks/20260923120000_weekly_free_ai_score.down.sql
-- (restores v9 verbatim) via scripts/apply-weekly-free-score.mjs --rollback.

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
  -- Free-sample refill period (rolling, per skill).
  v_free_window constant interval := interval '7 days';
  v_free_used_at timestamptz;
  v_next_free_at timestamptz;
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
    -- One free sample per AI skill per rolling 7 days. The column holds the
    -- last time this skill's free sample was taken (NULL = never, or
    -- refunded); it is read under the row lock above.
    v_free_used_at := case p_skill
      when 'speaking' then v_quota.free_speaking_score_used_at
      else v_quota.free_writing_score_used_at end;
    v_next_free_at := v_free_used_at + v_free_window;

    if v_free_used_at is null or v_next_free_at <= v_now then
      if p_skill = 'speaking' then
        update public.user_quotas
        set free_speaking_score_used_at = v_now
        where user_id = p_uid;
      else
        update public.user_quotas
        set free_writing_score_used_at = v_now
        where user_id = p_uid;
      end if;
      return jsonb_build_object(
        'allowed', true, 'remaining', 0, 'resetsAt', null,
        'plan', 'free', 'free', true, 'consumedAt', v_now,
        'freePeriod', 'week', 'nextFreeAt', v_now + v_free_window
      );
    end if;

    if coalesce(v_quota.referral_bonus_scores, 0) > 0 then
      update public.user_quotas
      set referral_bonus_scores = referral_bonus_scores - 1
      where user_id = p_uid;
      return jsonb_build_object(
        'allowed', true, 'remaining', v_quota.referral_bonus_scores - 1,
        'resetsAt', null, 'plan', 'free', 'free', false,
        'referral', true, 'consumedAt', v_now,
        'freePeriod', 'week', 'nextFreeAt', v_next_free_at
      );
    end if;

    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'resetsAt', v_next_free_at,
      'plan', 'free', 'free', false, 'reason', 'premium_required',
      'freePeriod', 'week', 'nextFreeAt', v_next_free_at
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
  'consume_ai_score v10: one free Writing and one free Speaking sample per rolling 7 days, then referral bonus credits, then Premium UTC caps.';

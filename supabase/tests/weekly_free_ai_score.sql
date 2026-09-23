-- Behavioural checks for consume_ai_score v10 (weekly free AI samples).
-- Run inside a transaction AFTER applying
-- supabase/migrations/20260923120000_weekly_free_ai_score.sql; the caller
-- MUST ROLLBACK (scripts/apply-weekly-free-score.mjs runs it inside a
-- savepoint and rolls back to it). Creates only synthetic
-- @example.invalid QA users; every row it writes is rolled back.
--
-- Both RPCs require the service_role JWT claim, so it is set locally.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  v_uid uuid := gen_random_uuid();
  v_prem uuid := gen_random_uuid();
  v_anon uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_r jsonb;
  v_first jsonb;
  v_at timestamptz;
  v_bonus int;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_uid, 'weekly-free-qa-' || v_uid || '@example.invalid', '{}'::jsonb),
    (v_prem, 'weekly-free-qa-' || v_prem || '@example.invalid', '{}'::jsonb),
    (v_anon, 'weekly-free-qa-' || v_anon || '@example.invalid', '{}'::jsonb);
  insert into public.users (id) values (v_uid), (v_prem), (v_anon)
    on conflict (id) do nothing;

  -- 1. Fresh free account: first Writing score is the free sample.
  v_first := public.consume_ai_score(v_uid, 'writing');
  if (v_first->>'allowed')::boolean is not true or (v_first->>'free')::boolean is not true then
    raise exception 'fresh account did not get a free writing sample: %', v_first;
  end if;
  if v_first->>'freePeriod' <> 'week'
    or (v_first->>'nextFreeAt')::timestamptz <> v_now + interval '7 days' then
    raise exception 'free grant missing weekly refill metadata: %', v_first;
  end if;

  -- 2. Same week: denied with the refill time, no referral credits to spend.
  v_r := public.consume_ai_score(v_uid, 'writing');
  if (v_r->>'allowed')::boolean or v_r->>'reason' <> 'premium_required'
    or (v_r->>'resetsAt')::timestamptz <> v_now + interval '7 days'
    or (v_r->>'nextFreeAt')::timestamptz <> v_now + interval '7 days' then
    raise exception 'second writing score in the same week was not denied correctly: %', v_r;
  end if;

  -- 3. Speaking is an independent allowance.
  v_r := public.consume_ai_score(v_uid, 'speaking');
  if (v_r->>'free')::boolean is not true then
    raise exception 'speaking sample was not independent of writing: %', v_r;
  end if;

  -- 4. Refund of the free writing score restores eligibility (refund v4
  --    clears the column only when it still matches), and is idempotent.
  if not public.refund_ai_score(v_uid, 'writing', true,
      (v_first->>'consumedAt')::timestamptz, false) then
    raise exception 'free writing refund was not applied';
  end if;
  if public.refund_ai_score(v_uid, 'writing', true,
      (v_first->>'consumedAt')::timestamptz, false) then
    raise exception 'free writing refund was applied twice';
  end if;
  select free_writing_score_used_at into v_at from public.user_quotas where user_id = v_uid;
  if v_at is not null then raise exception 'refund did not clear the writing sample'; end if;

  -- 5. Rolling window boundary: 6 days ago is still locked, >= 7 days refills.
  update public.user_quotas
    set free_writing_score_used_at = v_now - interval '6 days'
    where user_id = v_uid;
  v_r := public.consume_ai_score(v_uid, 'writing');
  if (v_r->>'allowed')::boolean
    or (v_r->>'nextFreeAt')::timestamptz <> v_now + interval '1 day' then
    raise exception 'sample used 6 days ago was granted again: %', v_r;
  end if;
  update public.user_quotas
    set free_writing_score_used_at = v_now - interval '7 days'
    where user_id = v_uid;
  v_r := public.consume_ai_score(v_uid, 'writing');
  if (v_r->>'free')::boolean is not true then
    raise exception 'sample used exactly 7 days ago did not refill: %', v_r;
  end if;
  select free_writing_score_used_at into v_at from public.user_quotas where user_id = v_uid;
  if v_at <> v_now then raise exception 'refill did not restamp the period marker'; end if;

  -- 6. Legacy lifetime users (sample taken long ago) are eligible again.
  update public.user_quotas
    set free_speaking_score_used_at = timestamptz '2026-08-03 00:00:00+00'
    where user_id = v_uid;
  v_r := public.consume_ai_score(v_uid, 'speaking');
  if (v_r->>'free')::boolean is not true then
    raise exception 'legacy lifetime speaking sample did not refill: %', v_r;
  end if;

  -- 7. Referral order: the weekly sample is spent BEFORE a referral credit;
  --    the credit is spent only when this week's sample is gone; its refund
  --    restores the credit. (Speaking is used here because every consume in
  --    this transaction shares one now(), and the writing refund key
  --    (user, skill, consumed_at) was already taken in step 4.)
  update public.user_quotas
    set free_speaking_score_used_at = null, referral_bonus_scores = 1
    where user_id = v_uid;
  v_r := public.consume_ai_score(v_uid, 'speaking');
  select referral_bonus_scores into v_bonus from public.user_quotas where user_id = v_uid;
  if (v_r->>'free')::boolean is not true or v_bonus <> 1 then
    raise exception 'referral credit was spent before the weekly sample: % bonus=%', v_r, v_bonus;
  end if;
  v_r := public.consume_ai_score(v_uid, 'speaking');
  select referral_bonus_scores into v_bonus from public.user_quotas where user_id = v_uid;
  if (v_r->>'referral')::boolean is not true or (v_r->>'free')::boolean or v_bonus <> 0 then
    raise exception 'referral credit was not used after the weekly sample: % bonus=%', v_r, v_bonus;
  end if;
  if not public.refund_ai_score(v_uid, 'speaking', false,
      (v_r->>'consumedAt')::timestamptz, true) then
    raise exception 'referral refund was not applied';
  end if;
  select referral_bonus_scores into v_bonus from public.user_quotas where user_id = v_uid;
  if v_bonus <> 1 then raise exception 'referral refund did not restore the credit'; end if;
  -- With the sample gone and the credit back, the NEXT call spends the
  -- credit again rather than granting a second free sample this week.
  v_r := public.consume_ai_score(v_uid, 'speaking');
  if (v_r->>'referral')::boolean is not true then
    raise exception 'second speaking score in the week bypassed the credit: %', v_r;
  end if;
  v_r := public.consume_ai_score(v_uid, 'speaking');
  if (v_r->>'allowed')::boolean or v_r->>'reason' <> 'premium_required' then
    raise exception 'free account scored beyond sample + credits: %', v_r;
  end if;

  -- 8. Anonymous accounts never get a free sample.
  update public.users set is_anonymous = true where id = v_anon;
  v_r := public.consume_ai_score(v_anon, 'writing');
  if (v_r->>'allowed')::boolean or v_r->>'reason' <> 'account_required' then
    raise exception 'anonymous account was not refused: %', v_r;
  end if;

  -- 9. Premium path is unchanged and never touches the free columns.
  update public.users set plan_expires_at = v_now + interval '30 days' where id = v_prem;
  v_r := public.consume_ai_score(v_prem, 'writing');
  if v_r->>'plan' <> 'premium' or (v_r->>'free')::boolean
    or (v_r->>'dailyRemaining')::int <> 1 or v_r ? 'nextFreeAt' then
    raise exception 'premium writing path changed: %', v_r;
  end if;
  if (select free_writing_score_used_at from public.user_quotas where user_id = v_prem) is not null then
    raise exception 'premium score stamped the free sample column';
  end if;
end;
$$;

-- Privileges: the Data API roles still cannot call either RPC directly.
do $$
begin
  if has_function_privilege('anon', 'public.consume_ai_score(uuid,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.consume_ai_score(uuid,text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.consume_ai_score(uuid,text)', 'EXECUTE') then
    raise exception 'consume_ai_score privileges drifted';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'refund_ai_score') <> 1 then
    raise exception 'refund_ai_score overloads changed';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'consume_ai_score'
      and p.prosecdef and p.proconfig @> array['search_path=""']
  ) then
    raise exception 'consume_ai_score lost SECURITY DEFINER or its empty search_path';
  end if;
end;
$$;

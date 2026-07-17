create or replace function public.consume_ai_score(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quota public.user_quotas%rowtype;
  v_plan text;
  v_now timestamptz := now();
begin
  if p_uid is null or (
    auth.uid() is distinct from p_uid
    and coalesce(auth.role(), '') <> 'service_role'
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select coalesce(to_jsonb(u)->>'plan', 'free') into v_plan
  from public.users u where u.id = p_uid;
  if v_plan in ('premium', 'pro', 'paid') then
    return jsonb_build_object('allowed', true, 'remaining', null, 'resetsAt', null, 'plan', v_plan);
  end if;

  insert into public.user_quotas (user_id, ai_scores_remaining, period_resets_at)
  values (p_uid, 3, v_now + interval '30 days')
  on conflict (user_id) do nothing;

  select * into v_quota from public.user_quotas where user_id = p_uid for update;
  if v_quota.period_resets_at is null or v_quota.period_resets_at <= v_now then
    update public.user_quotas
    set ai_scores_remaining = 3,
        period_resets_at = v_now + interval '30 days'
    where user_id = p_uid
    returning * into v_quota;
  end if;

  if v_quota.ai_scores_remaining <= 0 then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'resetsAt', v_quota.period_resets_at, 'plan', 'free');
  end if;

  update public.user_quotas
  set ai_scores_remaining = ai_scores_remaining - 1
  where user_id = p_uid
  returning * into v_quota;
  return jsonb_build_object('allowed', true, 'remaining', v_quota.ai_scores_remaining, 'resetsAt', v_quota.period_resets_at, 'plan', 'free');
end;
$$;

revoke all on function public.consume_ai_score(uuid) from public, anon;
grant execute on function public.consume_ai_score(uuid) to authenticated, service_role;
comment on function public.consume_ai_score(uuid) is
  'Atomically resets/decrements the monthly AI scoring allowance for the caller; includes a plan-based premium bypass.';

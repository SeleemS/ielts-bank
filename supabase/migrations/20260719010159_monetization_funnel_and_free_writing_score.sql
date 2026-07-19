-- Monetization funnel, one-time Exam Pass entitlement, onboarding deadline,
-- lifecycle-email idempotency, and consume_ai_score v6.
--
-- Security:
--   * billing/entitlement fields remain service-role-only through the existing
--     BEFORE UPDATE guard, extended below;
--   * lifecycle_emails has RLS enabled and no client policies/grants;
--   * consume_ai_score stays SECURITY DEFINER with an empty search_path,
--     validates the JWT subject, and is executable only by authenticated and
--     service_role.

-- ---------------------------------------------------------------------------
-- Users: measurement, SKU attribution, one-time access, and exam deadline.
-- ---------------------------------------------------------------------------
alter table public.users
  add column if not exists premium_since       timestamptz,
  add column if not exists plan_sku            text,
  add column if not exists plan_expires_at     timestamptz,
  add column if not exists exam_date           date,
  add column if not exists canceled_at         timestamptz,
  add column if not exists billing_pause_until timestamptz;

create index if not exists users_plan_expires_at_idx
  on public.users (plan_expires_at)
  where plan_expires_at is not null;

create index if not exists users_canceled_at_idx
  on public.users (canceled_at)
  where canceled_at is not null;

alter table public.activity_events
  add column if not exists billing_event_id text;

create unique index if not exists activity_events_billing_event_id_key
  on public.activity_events (billing_event_id)
  where billing_event_id is not null;

-- Extend the billing-column guard from 20260717130000. Profile fields such as
-- display_name, target_band, prefs, and exam_date remain user-editable.
create or replace function public.protect_billing_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    new.plan                   is distinct from old.plan or
    new.plan_status            is distinct from old.plan_status or
    new.plan_renews_at         is distinct from old.plan_renews_at or
    new.plan_started_at        is distinct from old.plan_started_at or
    new.premium_since          is distinct from old.premium_since or
    new.plan_sku               is distinct from old.plan_sku or
    new.plan_expires_at        is distinct from old.plan_expires_at or
    new.canceled_at            is distinct from old.canceled_at or
    new.billing_pause_until    is distinct from old.billing_pause_until or
    new.stripe_customer_id     is distinct from old.stripe_customer_id or
    new.stripe_subscription_id is distinct from old.stripe_subscription_id
  ) and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'billing columns are service-role only' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- One lifetime free Writing score. A timestamp makes the use auditable and
-- prevents resets or subscription churn from restoring the sample.
-- ---------------------------------------------------------------------------
alter table public.user_quotas
  add column if not exists free_writing_score_used_at timestamptz;

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
  v_cap int;
  v_used int;
  v_today date := (now() at time zone 'utc')::date;
  v_tomorrow timestamptz := date_trunc('day', now() at time zone 'utc') + interval '1 day';
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
      'allowed', false,
      'remaining', 0,
      'resetsAt', null,
      'plan', 'free',
      'free', false,
      'reason', 'account_required'
    );
  end if;

  v_premium := (
    case
      -- A non-null expiry identifies a one-time Exam Pass and is
      -- authoritative even while the stored plan status remains active.
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

  select *
  into v_quota
  from public.user_quotas
  where user_id = p_uid
  for update;

  if not v_premium then
    if p_skill <> 'writing' or v_quota.free_writing_score_used_at is not null then
      return jsonb_build_object(
        'allowed', false,
        'remaining', 0,
        'resetsAt', null,
        'plan', 'free',
        'free', false,
        'reason', 'premium_required'
      );
    end if;

    update public.user_quotas
    set free_writing_score_used_at = v_now
    where user_id = p_uid;

    return jsonb_build_object(
      'allowed', true,
      'remaining', 0,
      'resetsAt', null,
      'plan', 'free',
      'free', true,
      'consumedAt', v_now
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

  v_cap := case p_skill when 'speaking' then 1 else 2 end;
  v_used := case p_skill
    when 'speaking' then v_quota.speaking_scores_today
    else v_quota.writing_scores_today
  end;

  if v_used >= v_cap then
    return jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'resetsAt', v_tomorrow,
      'plan', 'premium',
      'free', false,
      'reason', 'daily_cap'
    );
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
    'allowed', true,
    'remaining', v_cap - v_used - 1,
    'resetsAt', v_tomorrow,
    'plan', 'premium',
    'free', false,
    'consumedAt', v_now
  );
end;
$$;

revoke all on function public.consume_ai_score(uuid, text) from public, anon;
grant execute on function public.consume_ai_score(uuid, text) to authenticated, service_role;

comment on function public.consume_ai_score(uuid, text) is
  'consume_ai_score v6: one lifetime free Writing score, no free Speaking, and premium per-skill daily fair-use caps.';

-- Restore a consumed unit when the provider fails before a score is returned.
-- The exact consumed timestamp makes retries idempotent and prevents an old
-- refund from clearing a later sample or decrementing a new day's counter.
create table if not exists public.ai_score_refunds (
  user_id     uuid not null references auth.users(id) on delete cascade,
  skill       text not null check (skill in ('writing', 'speaking')),
  consumed_at timestamptz not null,
  free        boolean not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, skill, consumed_at)
);

alter table public.ai_score_refunds enable row level security;
revoke all on table public.ai_score_refunds from anon, authenticated;
grant all on table public.ai_score_refunds to service_role;

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
    set writing_scores_today = greatest(writing_scores_today - 1, 0)
    where user_id = p_uid
      and daily_counters_date = v_consumed_day;
  else
    update public.user_quotas
    set speaking_scores_today = greatest(speaking_scores_today - 1, 0)
    where user_id = p_uid
      and daily_counters_date = v_consumed_day;
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

-- Keep the legacy one-argument wrapper aligned with v6.
create or replace function public.consume_ai_score(p_uid uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.consume_ai_score(p_uid, 'writing');
$$;

revoke all on function public.consume_ai_score(uuid) from public, anon;
grant execute on function public.consume_ai_score(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Lifecycle email outbox. Server routes write and deliver; clients cannot
-- enumerate recipients or mutate send state.
-- ---------------------------------------------------------------------------
create table if not exists public.lifecycle_emails (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  recipient_email text not null,
  email_type      text not null check (
    email_type in ('welcome_signup', 'welcome_purchase', 'weekly_digest', 'win_back')
  ),
  idempotency_key text not null unique,
  payload         jsonb not null default '{}'::jsonb,
  scheduled_for   timestamptz not null default now(),
  sent_at         timestamptz,
  provider_id     text,
  status          text not null default 'pending' check (
    status in ('pending', 'sending', 'sent', 'failed', 'suppressed')
  ),
  attempts        int not null default 0 check (attempts >= 0),
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.lifecycle_emails enable row level security;
revoke all on table public.lifecycle_emails from anon, authenticated;
grant all on table public.lifecycle_emails to service_role;

create index if not exists lifecycle_emails_due_idx
  on public.lifecycle_emails (scheduled_for, created_at)
  where status in ('pending', 'failed') and sent_at is null;

create index if not exists lifecycle_emails_user_type_idx
  on public.lifecycle_emails (user_id, email_type, created_at desc);

create index if not exists lifecycle_emails_sending_updated_idx
  on public.lifecycle_emails (updated_at)
  where status = 'sending' and sent_at is null;

create or replace function public.queue_signup_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and new.email_confirmed_at is not null then
    insert into public.lifecycle_emails (
      user_id,
      recipient_email,
      email_type,
      idempotency_key,
      payload
    )
    values (
      new.id,
      lower(new.email),
      'welcome_signup',
      'welcome_signup:' || new.id::text,
      jsonb_build_object('signup_at', coalesce(new.email_confirmed_at, new.created_at))
    )
    on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.queue_signup_welcome_email() from public, anon, authenticated;

drop trigger if exists queue_signup_welcome_on_insert on auth.users;
create trigger queue_signup_welcome_on_insert
  after insert on auth.users
  for each row execute function public.queue_signup_welcome_email();

drop trigger if exists queue_signup_welcome_on_confirm on auth.users;
create trigger queue_signup_welcome_on_confirm
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.queue_signup_welcome_email();

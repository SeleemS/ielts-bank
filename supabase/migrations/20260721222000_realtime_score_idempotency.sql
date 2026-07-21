-- Idempotent live-examiner transcript scoring. The browser retains the same
-- request_id across retry, while this private ledger serializes provider work
-- and replays a completed result without consuming another scoring request.

begin;

create schema if not exists private;

create table if not exists private.realtime_score_requests (
  request_id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  mode text not null check (mode in ('mock', 'part1', 'part2', 'part3')),
  transcript jsonb not null check (
    jsonb_typeof(transcript) = 'array'
    and pg_column_size(transcript) <= 262144
  ),
  status text not null default 'processing'
    check (status in ('processing', 'complete', 'failed')),
  lease_id uuid not null,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists realtime_score_requests_user_created_idx
  on private.realtime_score_requests (user_id, created_at desc);
create index if not exists realtime_score_requests_expires_idx
  on private.realtime_score_requests (expires_at);

create unique index if not exists attempts_realtime_request_id_unique_idx
  on public.attempts ((responses ->> 'realtime_request_id'))
  where responses ->> 'realtime_request_id' is not null;

alter table private.realtime_score_requests enable row level security;
revoke all on table private.realtime_score_requests
  from public, anon, authenticated, service_role;

create or replace function public.claim_realtime_score_request(
  p_request_id uuid,
  p_user_id uuid,
  p_mode text,
  p_transcript jsonb
)
returns table(action text, replay_result jsonb, claim_lease_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.realtime_score_requests%rowtype;
  v_lease_id uuid := gen_random_uuid();
  v_inserted integer := 0;
begin
  if p_request_id is null
    or p_user_id is null
    or p_mode not in ('mock', 'part1', 'part2', 'part3')
    or p_transcript is null
    or jsonb_typeof(p_transcript) <> 'array'
    or pg_column_size(p_transcript) > 262144
  then
    raise exception 'invalid realtime score request' using errcode = '22023';
  end if;

  insert into private.realtime_score_requests (
    request_id,
    user_id,
    mode,
    transcript,
    status,
    lease_id
  ) values (
    p_request_id,
    p_user_id,
    p_mode,
    p_transcript,
    'processing',
    v_lease_id
  )
  on conflict (request_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    return query select 'claimed'::text, null::jsonb, v_lease_id;
    return;
  end if;

  select request.*
  into v_row
  from private.realtime_score_requests as request
  where request.request_id = p_request_id
  for update;

  if not found
    or v_row.user_id <> p_user_id
    or v_row.mode <> p_mode
    or v_row.transcript <> p_transcript
  then
    return query select 'conflict'::text, null::jsonb, null::uuid;
    return;
  end if;

  if v_row.status = 'complete' and v_row.result is not null then
    return query select 'replay'::text, v_row.result, null::uuid;
    return;
  end if;

  if v_row.status = 'processing'
    and v_row.updated_at > clock_timestamp() - interval '2 minutes'
  then
    return query select 'busy'::text, null::jsonb, null::uuid;
    return;
  end if;

  update private.realtime_score_requests as request
  set status = 'processing',
      lease_id = v_lease_id,
      result = null,
      updated_at = clock_timestamp(),
      expires_at = clock_timestamp() + interval '24 hours'
  where request.request_id = p_request_id;

  return query select 'claimed'::text, null::jsonb, v_lease_id;
end;
$$;

create or replace function public.complete_realtime_score_request(
  p_request_id uuid,
  p_user_id uuid,
  p_lease_id uuid,
  p_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.realtime_score_requests%rowtype;
begin
  if p_result is null or jsonb_typeof(p_result) <> 'object' then
    raise exception 'invalid realtime score result' using errcode = '22023';
  end if;

  select request.*
  into v_row
  from private.realtime_score_requests as request
  where request.request_id = p_request_id
  for update;

  if not found
    or v_row.user_id <> p_user_id
    or v_row.lease_id <> p_lease_id
  then
    return false;
  end if;

  if v_row.status = 'complete' then
    return v_row.result = p_result;
  end if;
  if v_row.status <> 'processing' then
    return false;
  end if;

  update private.realtime_score_requests as request
  set status = 'complete',
      result = p_result,
      updated_at = clock_timestamp(),
      expires_at = clock_timestamp() + interval '24 hours'
  where request.request_id = p_request_id;
  return true;
end;
$$;

create or replace function public.fail_realtime_score_request(
  p_request_id uuid,
  p_user_id uuid,
  p_lease_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.realtime_score_requests%rowtype;
begin
  select request.*
  into v_row
  from private.realtime_score_requests as request
  where request.request_id = p_request_id
  for update;

  if not found
    or v_row.user_id <> p_user_id
    or v_row.lease_id <> p_lease_id
  then
    return false;
  end if;

  if v_row.status = 'failed' then
    return true;
  end if;
  if v_row.status <> 'processing' then
    return false;
  end if;

  update private.realtime_score_requests as request
  set status = 'failed',
      result = null,
      updated_at = clock_timestamp(),
      expires_at = clock_timestamp() + interval '24 hours'
  where request.request_id = p_request_id;
  return true;
end;
$$;

create or replace function public.cleanup_realtime_score_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removed integer := 0;
begin
  delete from private.realtime_score_requests as request
  where request.expires_at < clock_timestamp();
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

revoke execute on function public.claim_realtime_score_request(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public.complete_realtime_score_request(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public.fail_realtime_score_request(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.cleanup_realtime_score_requests()
  from public, anon, authenticated, service_role;

grant execute on function public.claim_realtime_score_request(uuid, uuid, text, jsonb)
  to service_role;
grant execute on function public.complete_realtime_score_request(uuid, uuid, uuid, jsonb)
  to service_role;
grant execute on function public.fail_realtime_score_request(uuid, uuid, uuid)
  to service_role;
grant execute on function public.cleanup_realtime_score_requests()
  to service_role;

comment on table private.realtime_score_requests is
  '24-hour service-only lease and replay ledger for idempotent live-examiner transcript scoring.';

commit;

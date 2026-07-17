alter table public.attempts
  add column if not exists total int,
  add column if not exists per_question jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'attempts_total_nonnegative'
      and conrelid = 'public.attempts'::regclass
  ) then
    alter table public.attempts
      add constraint attempts_total_nonnegative check (total is null or total >= 0);
  end if;
end $$;

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  anon_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  event text not null check (event ~ '^[a-z][a-z0-9_]{1,63}$'),
  skill public.skill,
  slug text,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_events_anon_created_idx
  on public.activity_events (anon_id, created_at desc);
create index if not exists activity_events_user_created_idx
  on public.activity_events (user_id, created_at desc)
  where user_id is not null;
create index if not exists activity_events_event_created_idx
  on public.activity_events (event, created_at desc);

alter table public.activity_events enable row level security;
revoke all on table public.activity_events from anon, authenticated;
grant all on table public.activity_events to service_role;

comment on table public.activity_events is
  'Server-received, rate-limited product telemetry. Never stores essay or transcript content.';

-- Full reports must not be readable through the client-owned scores table.
-- The authenticated API checks ownership and shapes free previews server-side.
create table public.writing_reports (
  attempt_id uuid primary key references public.attempts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  task smallint not null check (task in (1, 2)),
  task_type text not null check (task_type in ('task1-academic', 'task1-general', 'task2')),
  prompt text not null default '',
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  revision_of uuid references public.writing_reports(attempt_id) on delete set null,
  unlocked_at timestamptz,
  first_opened_at timestamptz,
  created_at timestamptz not null default now()
);
create index writing_reports_user_created_idx on public.writing_reports(user_id, created_at desc);
create index writing_reports_revision_idx on public.writing_reports(revision_of) where revision_of is not null;
alter table public.writing_reports enable row level security;
revoke all on public.writing_reports from public, anon, authenticated;
grant select, insert, update, delete on public.writing_reports to service_role;
comment on table public.writing_reports is 'Private AI Writing reports. Full feedback and first delivery are account records; only the server may access them. Previously unlocked reports remain in account history after plan expiry.';

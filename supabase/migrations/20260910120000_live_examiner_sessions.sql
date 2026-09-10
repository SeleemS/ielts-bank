-- 20260910120000_live_examiner_sessions.sql
-- Tracking table for gpt-live-1 examiner sessions (docs/MONETIZATION.md §9).
--
-- Live bills a flat per-session-minute rate for every second until the session
-- is closed or hung up — silence and a muted mic cost the same as speech. The
-- browser's `session.close` is best effort, so a crashed tab would otherwise
-- bill until OpenAI expires the session. This table is the ledger the end
-- route and the /api/cron/live-hangup sweep use to guarantee every session we
-- created is eventually hung up server-side.
--
--   id                    the OpenAI session id ('live_...'), so a sweep can
--                         call hangup without any extra mapping.
--   deadline_at           created + metered duration + 45 s grace; the sweep
--                         only touches rows past this.
--   client_usage_seconds  seconds the browser reported at close. Untrusted and
--                         capped by the route; recorded for cost analysis only.
--   hangup_attempts       retry counter; the sweep gives up after 5.
--
-- Service-role only: nothing here is user-facing, and the ids are spend
-- controls. RLS is enabled with no policies so a leaked anon/authenticated
-- key still reads nothing.

create table if not exists public.live_examiner_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null,
  duration_seconds int not null,
  deadline_at timestamptz not null,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text,
  client_usage_seconds numeric,
  hangup_attempts int not null default 0
);

-- The sweep's only query: open sessions past their deadline.
create index if not exists live_examiner_sessions_open_idx
  on public.live_examiner_sessions (ended_at, deadline_at);

alter table public.live_examiner_sessions enable row level security;
revoke all on table public.live_examiner_sessions from anon, authenticated;
grant all on table public.live_examiner_sessions to service_role;

comment on table public.live_examiner_sessions is
  'Open gpt-live-1 examiner sessions and their hangup state. Service-role only; the per-second Live meter stops only on close or hangup.';

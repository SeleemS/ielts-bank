-- 0004_users_attempts_scores.sql
-- User-owned data: the public mirror of auth.users, practice attempts,
-- AI scores, per-user quotas, and the content-ingest review queue.
--
-- RLS for these tables is defined in 0005. The intent enforced there:
--   * users        : owner can read/update their own row only
--   * user_quotas  : owner can read; only the service role may write
--   * attempts     : owner can insert + read own; IMMUTABLE after insert
--   * scores       : owner can read own; only the service role may write
--   * ingest_queue : no client access at all (service role only)

-- ---------------------------------------------------------------------------
-- users  (public profile row, 1:1 with auth.users)
-- Created automatically by the on-auth-insert trigger in 0006, preserving the
-- auth user id (so anonymous -> Google/magic-link upgrades keep the same id).
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         citext,
  display_name  text,
  is_anonymous  boolean not null default false,
  target_band   numeric(2,1),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_quotas  (rate/usage limits; e.g. free AI writing scores per day)
-- Separated from `users` so the client can read but NEVER write these numbers
-- (owner can update their own users row, but must not be able to top up quota).
-- ---------------------------------------------------------------------------
create table if not exists public.user_quotas (
  user_id             uuid primary key references public.users(id) on delete cascade,
  ai_scores_remaining int not null default 3,
  period_resets_at    timestamptz,
  updated_at          timestamptz not null default now()
);

drop trigger if exists user_quotas_set_updated_at on public.user_quotas;
create trigger user_quotas_set_updated_at
  before update on public.user_quotas
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- attempts  (one submission of a passage or mock test)
-- Immutable after insert: no UPDATE/DELETE policy is granted in 0005.
-- ---------------------------------------------------------------------------
create table if not exists public.attempts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  passage_id    uuid references public.passages(id) on delete set null,
  mock_test_id  uuid references public.mock_tests(id) on delete set null,
  skill         public.skill not null,
  -- responses: the raw user answers, e.g. { "1": "true", "2": "government" }
  responses     jsonb not null default '{}'::jsonb,
  raw_score     int,                          -- correct count for auto-scored skills
  band          numeric(2,1),                 -- resolved via band_tables (server-side)
  started_at    timestamptz,
  submitted_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists attempts_user_idx
  on public.attempts (user_id, created_at desc);
create index if not exists attempts_passage_idx
  on public.attempts (passage_id);

-- ---------------------------------------------------------------------------
-- scores  (AI writing/speaking evaluation; written by server only)
-- ---------------------------------------------------------------------------
create table if not exists public.scores (
  id            uuid primary key default gen_random_uuid(),
  attempt_id    uuid not null references public.attempts(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  skill         public.skill not null,        -- writing | speaking
  overall_band  numeric(2,1),
  -- criteria: per-criterion bands, e.g.
  -- { "task_response": 6.5, "coherence": 6.0, "lexical": 7.0, "grammar": 6.5 }
  criteria      jsonb not null default '{}'::jsonb,
  model         text,                          -- e.g. 'gpt-4', 'claude-...' (which model produced it)
  rubric_id     uuid references public.rubrics(id),
  feedback_html text,
  created_at    timestamptz not null default now()
);

create index if not exists scores_attempt_idx on public.scores (attempt_id);
create index if not exists scores_user_idx    on public.scores (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- ingest_queue  (content pipeline review; no client access)
-- Staging area for AI-generated / scraped passages awaiting editorial review
-- before being promoted into the content tables.
-- ---------------------------------------------------------------------------
create table if not exists public.ingest_queue (
  id           uuid primary key default gen_random_uuid(),
  skill        public.skill,
  module       public.module,
  source       text,                           -- 'ai-ingest', 'scrape', 'import', ...
  payload      jsonb not null,                 -- raw candidate content
  status       text not null default 'pending',-- pending | approved | rejected
  notes        text,
  reviewed_by  uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists ingest_queue_set_updated_at on public.ingest_queue;
create trigger ingest_queue_set_updated_at
  before update on public.ingest_queue
  for each row execute function public.set_updated_at();

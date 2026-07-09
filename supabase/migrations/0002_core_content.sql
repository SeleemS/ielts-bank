-- 0002_core_content.sql
-- Core content model: passages and their skill-specific detail tables,
-- question groups, options, questions and structured answer keys.
--
-- Design notes:
--  * One `passages` row per practice item, regardless of skill. Skill-specific
--    fields live in side tables (writing_details / speaking_details /
--    listening_details) to keep `passages` clean and avoid a wide sparse table.
--  * `legacy_firestore_id` preserves the OLD document id (writing ids contain
--    SPACES) so existing SSG URLs can be redirected at cutover. It is the
--    idempotency key for the migration script.
--  * `slug` is the new stable, URL-safe identifier used going forward.
--  * Content is never written by the client (enforced by RLS in 0005); writes
--    happen via the service role only.

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- rubrics (referenced by writing/speaking scoring)
-- ---------------------------------------------------------------------------
create table if not exists public.rubrics (
  id          uuid primary key default gen_random_uuid(),
  skill       public.skill not null,
  name        text not null,
  version     int  not null default 1,
  -- criteria: array of { key, label, weight, descriptors } used by the AI scorer.
  criteria    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (skill, name, version)
);

-- ---------------------------------------------------------------------------
-- passages (the spine of the content model)
-- ---------------------------------------------------------------------------
create table if not exists public.passages (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,
  legacy_firestore_id  text unique,               -- old Firestore doc id (may contain spaces)
  skill                public.skill not null,
  module               public.module,             -- nullable = module-agnostic
  title                text not null,
  -- Reading/Listening body copy (HTML, rendered via dangerouslySetInnerHTML).
  -- Writing/Speaking keep their prompt in the detail table instead.
  body_html            text,
  difficulty           public.difficulty,
  topic_tags           text[] not null default '{}',
  status               public.content_status not null default 'draft',
  source               text,                      -- provenance: 'firestore', 'editorial', 'ai-ingest', ...
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists passages_skill_module_status_idx
  on public.passages (skill, module, status);
create index if not exists passages_legacy_firestore_id_idx
  on public.passages (legacy_firestore_id);
create index if not exists passages_topic_tags_gin_idx
  on public.passages using gin (topic_tags);

drop trigger if exists passages_set_updated_at on public.passages;
create trigger passages_set_updated_at
  before update on public.passages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- writing_details  (Task 1 / Task 2)
-- ---------------------------------------------------------------------------
create table if not exists public.writing_details (
  passage_id      uuid primary key references public.passages(id) on delete cascade,
  task            int not null default 2,             -- 1 or 2
  prompt_html     text not null,
  chart_image_path text,                              -- storage path for Task 1 charts (NOT a token URL)
  word_limit_min  int not null default 250,
  rubric_id       uuid references public.rubrics(id)
);

-- ---------------------------------------------------------------------------
-- speaking_details  (Part 1 / 2 / 3)
-- ---------------------------------------------------------------------------
create table if not exists public.speaking_details (
  passage_id      uuid primary key references public.passages(id) on delete cascade,
  part            int not null,                       -- 1, 2 or 3
  -- cue_card: { topic, bullets: [...], prep_seconds, speak_seconds } for Part 2.
  cue_card        jsonb,
  part3_followups jsonb,                              -- array of follow-up prompts
  rubric_id       uuid references public.rubrics(id)
);

-- ---------------------------------------------------------------------------
-- listening_details  (audio stored as a STORAGE PATH, not a token URL)
-- ---------------------------------------------------------------------------
create table if not exists public.listening_details (
  passage_id      uuid primary key references public.passages(id) on delete cascade,
  audio_path      text,                               -- e.g. 'listening/section-1.mp3' in the listening-audio bucket
  legacy_audio_url text,                              -- captured from Firestore audioUrl for reference only
  transcript_html text,
  voices          jsonb                               -- [{ name, accent, role }]
);

-- ---------------------------------------------------------------------------
-- question_groups
-- ---------------------------------------------------------------------------
create table if not exists public.question_groups (
  id                uuid primary key default gen_random_uuid(),
  passage_id        uuid not null references public.passages(id) on delete cascade,
  position          int not null default 0,           -- display order within the passage
  question_type     public.question_type not null,
  prompt            text,                              -- group heading / instruction (legacy `prompt`)
  instructions_html text,
  created_at        timestamptz not null default now()
);

create index if not exists question_groups_passage_idx
  on public.question_groups (passage_id, position);

-- ---------------------------------------------------------------------------
-- group_options
-- Separates the option KEY (A/B/i/ii) from its display TEXT so MCQ and matching
-- question types are not brittle. For legacy 'Match'-as-MCQ data the key is
-- synthesised (A, B, C, ...) and display_text carries the full option string.
-- ---------------------------------------------------------------------------
create table if not exists public.group_options (
  id                uuid primary key default gen_random_uuid(),
  question_group_id uuid not null references public.question_groups(id) on delete cascade,
  option_key        text not null,                    -- 'A', 'B', 'i', 'ii', ...
  display_text      text not null,
  position          int not null default 0,
  unique (question_group_id, option_key)
);

create index if not exists group_options_group_idx
  on public.group_options (question_group_id, position);

-- ---------------------------------------------------------------------------
-- questions
-- passage_id is denormalised from the parent group for cheap per-passage
-- auto-scoring queries and indexing.
-- ---------------------------------------------------------------------------
create table if not exists public.questions (
  id                uuid primary key default gen_random_uuid(),
  question_group_id uuid not null references public.question_groups(id) on delete cascade,
  passage_id        uuid not null references public.passages(id) on delete cascade,
  position          int not null default 0,           -- order within the group
  global_number     int,                              -- continuous 1..N across the passage (matches today's UI)
  prompt_text       text,                             -- legacy question `text`
  created_at        timestamptz not null default now()
);

create index if not exists questions_group_idx
  on public.questions (question_group_id, position);
create index if not exists questions_passage_idx
  on public.questions (passage_id, global_number);

-- ---------------------------------------------------------------------------
-- answer_keys  (structured, one row per question)
-- Consumed UNIFORMLY by Reading/Listening auto-scoring:
--   * choice types  -> compare user's chosen option_key against correct_option_keys
--   * text types    -> normalise per `normalize` policy, then test membership in
--                      `accepted` (case-insensitive by default)
-- ---------------------------------------------------------------------------
create table if not exists public.answer_keys (
  id                   uuid primary key default gen_random_uuid(),
  question_id          uuid not null unique references public.questions(id) on delete cascade,
  -- Accepted free-text answers (alternatives). Case-insensitivity is applied by
  -- the scorer per `normalize`; stored verbatim here.
  accepted             text[] not null default '{}',
  -- For choice/matching types: the correct option key(s). Kept as keys (not FK
  -- ids) so the key set survives option re-ordering and is portable.
  correct_option_keys  text[] not null default '{}',
  spelling_variants    boolean not null default false, -- tolerate common misspellings/variants
  word_limit           int,                             -- e.g. "NO MORE THAN TWO WORDS" -> 2
  normalize            public.normalize_policy not null default 'lower_trim',
  created_at           timestamptz not null default now()
);

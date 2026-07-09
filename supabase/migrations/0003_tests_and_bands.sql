-- 0003_tests_and_bands.sql
-- Mock tests (compose passages into timed exams) and band-score conversion
-- tables (raw correct count -> IELTS band). Academic and General Training use
-- different raw->band curves for Reading, so band_tables are parameterised by
-- skill + module.

-- ---------------------------------------------------------------------------
-- mock_tests
-- ---------------------------------------------------------------------------
create table if not exists public.mock_tests (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  module      public.module,                 -- academic / general / NULL (mixed)
  description text,
  status      public.content_status not null default 'draft',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists mock_tests_module_status_idx
  on public.mock_tests (module, status);

drop trigger if exists mock_tests_set_updated_at on public.mock_tests;
create trigger mock_tests_set_updated_at
  before update on public.mock_tests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- mock_test_sections
-- Ordered, timed sections that reference existing passages. A single mock test
-- can span multiple skills (a full IELTS test = Listening + Reading + Writing).
-- ---------------------------------------------------------------------------
create table if not exists public.mock_test_sections (
  id                 uuid primary key default gen_random_uuid(),
  mock_test_id       uuid not null references public.mock_tests(id) on delete cascade,
  passage_id         uuid not null references public.passages(id) on delete restrict,
  skill              public.skill not null,
  position           int not null default 0,
  time_limit_seconds int not null default 1200,   -- e.g. Reading section = 20 min
  created_at         timestamptz not null default now(),
  unique (mock_test_id, position)
);

create index if not exists mock_test_sections_test_idx
  on public.mock_test_sections (mock_test_id, position);

-- ---------------------------------------------------------------------------
-- band_tables + band_table_rows  (raw -> band conversion)
-- ---------------------------------------------------------------------------
create table if not exists public.band_tables (
  id          uuid primary key default gen_random_uuid(),
  skill       public.skill not null,
  module      public.module,                 -- Academic vs GT Reading differ; NULL = applies to both
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (skill, module, name)
);

create table if not exists public.band_table_rows (
  id             uuid primary key default gen_random_uuid(),
  band_table_id  uuid not null references public.band_tables(id) on delete cascade,
  raw_min        int not null,               -- inclusive lower bound of raw correct count
  raw_max        int not null,               -- inclusive upper bound
  band           numeric(2,1) not null,      -- 0.0 .. 9.0 in 0.5 steps
  check (raw_min <= raw_max),
  check (band >= 0 and band <= 9)
);

create index if not exists band_table_rows_lookup_idx
  on public.band_table_rows (band_table_id, raw_min, raw_max);

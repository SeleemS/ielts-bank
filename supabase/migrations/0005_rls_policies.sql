-- 0005_rls_policies.sql
-- Row-Level Security. Enabled on EVERY table. The security model:
--
--   Content (passages, groups, options, questions, answer_keys, *_details,
--   mock_tests, sections, band_tables/rows, rubrics):
--     * world-readable when published (drafts hidden from anon/authenticated)
--     * NEVER client-writable -> writes only via the service role, which
--       BYPASSES RLS entirely (no INSERT/UPDATE/DELETE policy is created).
--
--   User data:
--     * users        : owner read/update own row (auth.uid() = id)
--     * user_quotas  : owner read own; NO client write (service role only)
--     * attempts     : owner insert + read own; IMMUTABLE (no update/delete)
--     * scores       : owner read own; NO client write (service role only)
--     * ingest_queue : NO client access at all
--
-- NOTE ON ANSWER KEYS: they are world-readable here, which matches TODAY's
-- behaviour (the app already ships answers to the browser and auto-scores
-- client-side). See MIGRATION_PLAN.md "Open decisions" for the option to move
-- Reading/Listening scoring server-side and lock answer_keys down later.

-- ===========================================================================
-- Enable RLS everywhere
-- ===========================================================================
alter table public.rubrics             enable row level security;
alter table public.passages            enable row level security;
alter table public.writing_details     enable row level security;
alter table public.speaking_details    enable row level security;
alter table public.listening_details   enable row level security;
alter table public.question_groups     enable row level security;
alter table public.group_options       enable row level security;
alter table public.questions           enable row level security;
alter table public.answer_keys         enable row level security;
alter table public.mock_tests          enable row level security;
alter table public.mock_test_sections  enable row level security;
alter table public.band_tables         enable row level security;
alter table public.band_table_rows     enable row level security;
alter table public.users               enable row level security;
alter table public.user_quotas         enable row level security;
alter table public.attempts            enable row level security;
alter table public.scores              enable row level security;
alter table public.ingest_queue        enable row level security;

-- ===========================================================================
-- Content: public READ only. No write policies => client writes denied;
-- the service role bypasses RLS for the migration + editorial tooling.
-- ===========================================================================

-- passages: only published rows are visible to anon/authenticated.
drop policy if exists passages_read_published on public.passages;
create policy passages_read_published
  on public.passages for select
  to anon, authenticated
  using (status = 'published');

-- Child content tables inherit visibility from a PUBLISHED parent passage.
drop policy if exists writing_details_read on public.writing_details;
create policy writing_details_read
  on public.writing_details for select
  to anon, authenticated
  using (exists (select 1 from public.passages p
                 where p.id = writing_details.passage_id and p.status = 'published'));

drop policy if exists speaking_details_read on public.speaking_details;
create policy speaking_details_read
  on public.speaking_details for select
  to anon, authenticated
  using (exists (select 1 from public.passages p
                 where p.id = speaking_details.passage_id and p.status = 'published'));

drop policy if exists listening_details_read on public.listening_details;
create policy listening_details_read
  on public.listening_details for select
  to anon, authenticated
  using (exists (select 1 from public.passages p
                 where p.id = listening_details.passage_id and p.status = 'published'));

drop policy if exists question_groups_read on public.question_groups;
create policy question_groups_read
  on public.question_groups for select
  to anon, authenticated
  using (exists (select 1 from public.passages p
                 where p.id = question_groups.passage_id and p.status = 'published'));

drop policy if exists group_options_read on public.group_options;
create policy group_options_read
  on public.group_options for select
  to anon, authenticated
  using (exists (select 1 from public.question_groups g
                 join public.passages p on p.id = g.passage_id
                 where g.id = group_options.question_group_id and p.status = 'published'));

drop policy if exists questions_read on public.questions;
create policy questions_read
  on public.questions for select
  to anon, authenticated
  using (exists (select 1 from public.passages p
                 where p.id = questions.passage_id and p.status = 'published'));

drop policy if exists answer_keys_read on public.answer_keys;
create policy answer_keys_read
  on public.answer_keys for select
  to anon, authenticated
  using (exists (select 1 from public.questions q
                 join public.passages p on p.id = q.passage_id
                 where q.id = answer_keys.question_id and p.status = 'published'));

-- rubrics: harmless reference data, world-readable.
drop policy if exists rubrics_read on public.rubrics;
create policy rubrics_read
  on public.rubrics for select
  to anon, authenticated
  using (true);

-- mock tests + sections: visible when published.
drop policy if exists mock_tests_read on public.mock_tests;
create policy mock_tests_read
  on public.mock_tests for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists mock_test_sections_read on public.mock_test_sections;
create policy mock_test_sections_read
  on public.mock_test_sections for select
  to anon, authenticated
  using (exists (select 1 from public.mock_tests t
                 where t.id = mock_test_sections.mock_test_id and t.status = 'published'));

-- band tables: world-readable reference data.
drop policy if exists band_tables_read on public.band_tables;
create policy band_tables_read
  on public.band_tables for select
  to anon, authenticated
  using (true);

drop policy if exists band_table_rows_read on public.band_table_rows;
create policy band_table_rows_read
  on public.band_table_rows for select
  to anon, authenticated
  using (true);

-- ===========================================================================
-- users: owner-only read/update. Inserts happen via the SECURITY DEFINER
-- trigger in 0006 (which runs as table owner), so no client insert policy.
-- ===========================================================================
drop policy if exists users_select_own on public.users;
create policy users_select_own
  on public.users for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists users_update_own on public.users;
create policy users_update_own
  on public.users for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ===========================================================================
-- user_quotas: owner may READ their quota; only the service role may WRITE it.
-- ===========================================================================
drop policy if exists user_quotas_select_own on public.user_quotas;
create policy user_quotas_select_own
  on public.user_quotas for select
  to authenticated
  using (auth.uid() = user_id);

-- ===========================================================================
-- attempts: owner may INSERT and SELECT own rows. No UPDATE/DELETE policy =>
-- rows are IMMUTABLE once written.
-- ===========================================================================
drop policy if exists attempts_insert_own on public.attempts;
create policy attempts_insert_own
  on public.attempts for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists attempts_select_own on public.attempts;
create policy attempts_select_own
  on public.attempts for select
  to authenticated
  using (auth.uid() = user_id);

-- ===========================================================================
-- scores: owner may READ own; only the service role may WRITE (server API
-- routes / Edge Functions produce AI scores). No client write policy.
-- ===========================================================================
drop policy if exists scores_select_own on public.scores;
create policy scores_select_own
  on public.scores for select
  to authenticated
  using (auth.uid() = user_id);

-- ===========================================================================
-- ingest_queue: RLS enabled with NO policies => zero access for anon and
-- authenticated. Only the service role (which bypasses RLS) can touch it.
-- ===========================================================================
-- (intentionally no policies)

-- 0001_extensions_and_enums.sql
-- IELTS-Bank :: Firebase -> Supabase migration
-- Foundational extensions and enumerated types.
--
-- Run order: this file is 0001 and must run before all others.
-- Everything here is idempotent-safe (IF NOT EXISTS / guarded DO blocks)
-- so re-applying the migration set never errors.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- pgcrypto gives us gen_random_uuid(). On Supabase this lives in the
-- "extensions" schema by convention; "create extension if not exists" is safe.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------

-- Which of the four IELTS skills a piece of content belongs to.
do $$ begin
  create type public.skill as enum ('reading', 'listening', 'writing', 'speaking');
exception when duplicate_object then null; end $$;

-- Academic vs General Training. NULL is allowed at the column level for content
-- that is module-agnostic (e.g. most Listening, some Speaking).
do $$ begin
  create type public.module as enum ('academic', 'general');
exception when duplicate_object then null; end $$;

-- Editorial lifecycle for a passage / content item.
do $$ begin
  create type public.content_status as enum ('draft', 'in_review', 'published', 'archived');
exception when duplicate_object then null; end $$;

-- Difficulty. Historic Firestore data used Easy/Medium/Hard (title-case) for
-- reading/listening; Writing docs carried "Task 2" in the same field, which is a
-- task marker, NOT a difficulty -- the migration script routes that to
-- writing_details.task instead of here.
do $$ begin
  create type public.difficulty as enum ('easy', 'medium', 'hard');
exception when duplicate_object then null; end $$;

-- The FULL IELTS question-type spectrum, not just the four types shipped today
-- ('Match', 'True or False', 'Yes or No', 'Short Answer'). Discriminates the
-- shape of a question_group. The migration script maps legacy types into these.
do $$ begin
  create type public.question_type as enum (
    'multiple_choice',            -- single correct option
    'multiple_choice_multi',      -- choose N correct options
    'true_false_notgiven',        -- legacy 'True or False'
    'yes_no_notgiven',            -- legacy 'Yes or No'
    'matching_information',       -- match statements to paragraphs
    'matching_headings',
    'matching_features',
    'matching_sentence_endings',
    'sentence_completion',
    'summary_completion',
    'note_completion',
    'table_completion',
    'flowchart_completion',
    'diagram_label',
    'plan_map_diagram_label',
    'short_answer',               -- legacy 'Short Answer'
    'form_completion'
  );
exception when duplicate_object then null; end $$;

-- How an attempt's answers are normalised before comparison to the answer key.
do $$ begin
  create type public.normalize_policy as enum (
    'lower_trim',     -- lowercase + trim + collapse internal whitespace (default)
    'trim',           -- trim only (case-sensitive)
    'none'            -- exact match
  );
exception when duplicate_object then null; end $$;

-- 0011_contact_messages.sql
-- Storage for messages submitted through the public Contact Us form.
--
-- SECURITY MODEL (mirrors 0008_rate_limits.sql):
--   * RLS is ENABLED and NO client policies are created, so anon/authenticated
--     roles can neither read nor write this table. It is written EXCLUSIVELY by
--     the service role (which BYPASSES RLS) from the trusted /api/contact route,
--     which validates input and rate-limits per IP via check_rate_limit().
--   * Column CHECK constraints cap length as a defence-in-depth backstop to the
--     server-side validation.

create table if not exists public.contact_messages (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text        not null check (char_length(name) <= 200),
  email      text        not null check (char_length(email) <= 320),
  message    text        not null check (char_length(message) <= 5000)
);

-- Newest-first listing for whoever triages messages (service role only).
create index if not exists contact_messages_created_at_idx
  on public.contact_messages (created_at desc);

-- RLS: enabled, no client policies (service-role only).
alter table public.contact_messages enable row level security;

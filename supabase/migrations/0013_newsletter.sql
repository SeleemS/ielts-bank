-- 0013_newsletter.sql
-- Email capture for the marketing newsletter ("new practice tests in your inbox").
--
-- SECURITY MODEL:
--   * RLS is ENABLED and NO client policies are created, so anon/authenticated
--     roles can neither read nor write this table. Subscriptions are inserted
--     exclusively by the service role (which BYPASSES RLS) from the trusted
--     /api/newsletter/subscribe route. This prevents both address harvesting
--     (nobody can SELECT the list) and unsolicited writes from the browser.
--   * The insert path is rate-limited per IP in the API route via
--     check_rate_limit() (bucket 'newsletter'); the endpoint always responds
--     {ok:true} for a validly-formatted email so subscriber existence cannot be
--     enumerated.

create table if not exists public.newsletter_subscribers (
  id              uuid        primary key default gen_random_uuid(),
  email           text        not null unique check (char_length(email) <= 320),
  created_at      timestamptz default now(),
  source          text,
  confirmed       boolean     not null default false,
  unsubscribed_at timestamptz
);

-- RLS: enabled, no client policies (service-role only).
alter table public.newsletter_subscribers enable row level security;

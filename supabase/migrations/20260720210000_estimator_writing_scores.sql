-- Anonymous Band Estimator writing samples.
--
-- The estimator scores a short (~100-word) paragraph server-side and stores the
-- result here keyed by anon_id, WITHOUT returning the band to the anonymous
-- client — the Writing band is a sign-up reward, and gating it only client-side
-- would be trivially bypassable (the mistake we just removed from the paid
-- Writing report). On sign-in, /api/estimator/reveal reads the latest UNCLAIMED
-- row for the visitor's anon_id, returns the band, marks it claimed, and mirrors
-- it into the user's attempts/scores history so it shows on their dashboard.
--
-- Service-role only: RLS is enabled with no policies AND direct grants are
-- revoked, so neither the anon nor the authenticated PostgREST role can read a
-- band (their own pre-claim, or anyone else's). Only the API routes, which use
-- the service key, can read or write.

create table if not exists public.estimator_writing_scores (
  id uuid primary key default gen_random_uuid(),
  anon_id uuid not null,
  essay text not null,
  word_count integer not null,
  writing_band numeric(2,1) not null check (writing_band between 0 and 9),
  result jsonb not null default '{}'::jsonb,
  model text,
  claimed_by_user_id uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Reveal looks up the most recent unclaimed row for an anon_id.
create index if not exists estimator_writing_scores_anon_idx
  on public.estimator_writing_scores (anon_id, created_at desc);

alter table public.estimator_writing_scores enable row level security;
revoke all on public.estimator_writing_scores from anon, authenticated;

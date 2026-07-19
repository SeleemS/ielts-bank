-- Journey-grade client identifiers for dual GA4 + first-party interaction
-- analytics. The table remains service-role-only; browsers write through the
-- origin-checked, rate-limited /api/track endpoint.
alter table public.activity_events
  add column if not exists client_event_id uuid,
  add column if not exists session_id uuid,
  add column if not exists page_view_id uuid,
  add column if not exists occurred_at timestamptz;

create unique index if not exists activity_events_client_event_id_key
  on public.activity_events (client_event_id)
  where client_event_id is not null;

create index if not exists activity_events_session_occurred_idx
  on public.activity_events (session_id, occurred_at, created_at)
  where session_id is not null;

create index if not exists activity_events_page_view_occurred_idx
  on public.activity_events (page_view_id, occurred_at, created_at)
  where page_view_id is not null;

comment on column public.activity_events.client_event_id is
  'Client-generated UUID used to deduplicate a logical analytics event.';
comment on column public.activity_events.session_id is
  'Per-tab session UUID used to reconstruct an ordered user journey.';
comment on column public.activity_events.page_view_id is
  'UUID shared by all events emitted during one SPA page view.';
comment on column public.activity_events.occurred_at is
  'Validated client timestamp; created_at remains the trusted server receipt time.';

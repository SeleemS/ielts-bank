-- Google Tag Manager loads a same-origin service-worker iframe under /gt/_/.
-- Next.js renders _app for that internal document, so older clients could
-- create fake page/auth events. Client and API guards prevent recurrence;
-- remove only known internal application paths from historical telemetry.
delete from public.activity_events
where coalesce(props->>'path', '') ~ '^/(api|_next|gt)(/|$)';

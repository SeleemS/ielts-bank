alter table public.answer_keys
  add column if not exists explanation text;

comment on column public.answer_keys.explanation is
  'Sanitized-on-render evidence or rationale shown only after an attempt is submitted.';

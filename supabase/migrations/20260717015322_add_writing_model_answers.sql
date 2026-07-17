alter table public.writing_details
  add column if not exists model_answer_html text,
  add column if not exists model_answer_rationale_html text;

comment on column public.writing_details.model_answer_html is
  'Editorially generated high-band sample response for this writing task.';
comment on column public.writing_details.model_answer_rationale_html is
  'Brief examiner-style explanation of why the sample is effective.';

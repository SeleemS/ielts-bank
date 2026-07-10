-- 0009_group_image.sql
-- Adds an optional per-question-group SVG illustration (e.g. the map/plan used by
-- map-labelling matching questions). Purely additive: the column is nullable and
-- groups without it render exactly as before. Grading, options and answers are
-- unaffected — image_svg is display-only.

alter table public.question_groups
  add column if not exists image_svg text;

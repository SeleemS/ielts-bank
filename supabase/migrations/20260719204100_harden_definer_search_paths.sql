-- SECURITY DEFINER functions must not resolve application objects through a
-- mutable schema search path. All four bodies already qualify their table
-- references with public., so an empty path is behavior-preserving while
-- leaving pg_catalog built-ins available implicitly.

alter function public.check_rate_limit(text, text, integer, integer)
  set search_path = '';

alter function public.handle_new_user()
  set search_path = '';

alter function public.handle_user_update()
  set search_path = '';

alter function public.record_login(uuid, text, text, text, text, jsonb)
  set search_path = '';

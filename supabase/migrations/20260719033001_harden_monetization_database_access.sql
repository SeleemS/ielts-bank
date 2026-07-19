-- Follow-up hardening from the post-monetization Supabase advisors.
--
-- All scoring/meter mutations are performed by server routes with the service
-- role. Direct client execution only expands the exposed API surface.

alter function public.set_updated_at() set search_path = '';

revoke execute on function public.set_updated_at()
  from public, anon, authenticated;
revoke execute on function public.handle_new_user()
  from public, anon, authenticated;
revoke execute on function public.handle_user_update()
  from public, anon, authenticated;

revoke execute on function public.consume_ai_score(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.consume_ai_score(uuid)
  from public, anon, authenticated;
revoke execute on function public.consume_realtime_seconds(uuid, int)
  from public, anon, authenticated;

grant execute on function public.consume_ai_score(uuid, text)
  to service_role;
grant execute on function public.consume_ai_score(uuid)
  to service_role;
grant execute on function public.consume_realtime_seconds(uuid, int)
  to service_role;

-- Public bucket URLs do not require a broad storage.objects SELECT policy.
-- Removing it preserves known public URLs while preventing object enumeration.
drop policy if exists listening_audio_public_read on storage.objects;

-- Wrap auth.uid() in scalar subqueries so Postgres evaluates it once per
-- statement rather than once per row.
drop policy if exists users_select_own on public.users;
create policy users_select_own
  on public.users for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists users_update_own on public.users;
create policy users_update_own
  on public.users for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists user_quotas_select_own on public.user_quotas;
create policy user_quotas_select_own
  on public.user_quotas for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists attempts_insert_own on public.attempts;
create policy attempts_insert_own
  on public.attempts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists attempts_select_own on public.attempts;
create policy attempts_select_own
  on public.attempts for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists scores_select_own on public.scores;
create policy scores_select_own
  on public.scores for select
  to authenticated
  using ((select auth.uid()) = user_id);

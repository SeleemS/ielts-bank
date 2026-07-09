-- 0007_storage_buckets.sql
-- Supabase Storage buckets + policies.
--
--   listening-audio  : PUBLIC read. Holds IELTS Listening clips. Objects are
--                       referenced by PATH from listening_details.audio_path;
--                       getStaticProps resolves path -> public URL at build time
--                       (see lib/supabase.js audioPublicUrl / MIGRATION_PLAN.md).
--                       Writes: service role only.
--
--   speaking-uploads : PRIVATE, owner-only. Holds user Part-2 audio recordings.
--                       Convention: first path segment = the owner's auth uid,
--                       e.g. '<uid>/attempt-<id>.webm'. Size/type limits below.
--
-- Buckets can also be created in the Supabase dashboard; this migration makes
-- the setup reproducible and version-controlled.

-- ---------------------------------------------------------------------------
-- Create buckets (idempotent).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listening-audio', 'listening-audio', true,
  52428800,                                   -- 50 MB
  array['audio/mpeg','audio/mp3','audio/wav','audio/ogg','audio/webm','audio/mp4']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'speaking-uploads', 'speaking-uploads', false,
  26214400,                                   -- 25 MB
  array['audio/webm','audio/mp4','audio/mpeg','audio/ogg','audio/wav']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- listening-audio: public read for anon + authenticated. Writes = service role.
-- ---------------------------------------------------------------------------
drop policy if exists listening_audio_public_read on storage.objects;
create policy listening_audio_public_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'listening-audio');

-- ---------------------------------------------------------------------------
-- speaking-uploads: owner-only. The first folder in the object path must equal
-- the caller's uid: storage.foldername(name)[1] = auth.uid()::text.
-- ---------------------------------------------------------------------------
drop policy if exists speaking_uploads_insert_own on storage.objects;
create policy speaking_uploads_insert_own
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'speaking-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists speaking_uploads_select_own on storage.objects;
create policy speaking_uploads_select_own
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'speaking-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists speaking_uploads_delete_own on storage.objects;
create policy speaking_uploads_delete_own
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'speaking-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- 0044_avatar_uploads_via_service_role.sql
-- Direct authenticated-role uploads to Supabase Storage don't work
-- reliably in this project (confirmed via live testing during 0042/
-- 0043 — even a trivial `bucket_id = 'avatars'` check with a verified
-- valid JWT was rejected). app/api/documents/route.ts already
-- documents this same limitation and works around it by uploading
-- via the service role key from a server-side route instead.
--
-- Avatar uploads now follow that same pattern (see
-- app/api/coach-avatar/route.ts and app/api/athlete-avatar/route.ts),
-- so the storage.objects RLS policies from 0042/0043 are dead code —
-- and the maximally-permissive temporary debug policy used to
-- diagnose this must be removed, since it currently allows any
-- authenticated user to upload anything to the avatars bucket.
-- ============================================================

drop policy if exists "Coaches can upload avatars in their own org" on storage.objects;
drop policy if exists "TEMP debug — any authenticated insert to avatars" on storage.objects;
drop policy if exists "Coaches can replace avatars in their own org" on storage.objects;
drop policy if exists "Coaches can delete avatars in their own org" on storage.objects;

-- ============================================================
-- 0042_avatars.sql
-- Profile pictures for coaches and athletes.
-- ============================================================

alter table coaches add column if not exists avatar_url text;
alter table athletes add column if not exists avatar_url text;

-- Public bucket (same pattern as org-logos in 0021_branding.sql) —
-- avatars render in list views without needing signed-URL requests.
-- Object paths are namespaced by kind so RLS can scope access:
--   coach/<coach_id>/<filename>
--   athlete/<athlete_id>/<filename>
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Coaches upload directly from the browser (authenticated session),
-- so these policies gate storage writes. Athletes have no Supabase
-- Auth session — their own upload goes through a service-role API
-- route instead (app/api/athlete-link/avatar), which bypasses RLS
-- entirely and does its own token-based ownership check, matching
-- the athlete-link security pattern used elsewhere in this app.

create policy "Coaches can upload avatars in their own org"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (
    ((storage.foldername(name))[1] = 'coach' and (storage.foldername(name))[2] = auth.uid()::text)
    or
    ((storage.foldername(name))[1] = 'athlete' and exists (
      select 1 from athletes
      where athletes.id::text = (storage.foldername(name))[2]
        and athletes.organisation_id = my_organisation_id()
    ))
  )
);

create policy "Coaches can replace avatars in their own org"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (
    ((storage.foldername(name))[1] = 'coach' and (storage.foldername(name))[2] = auth.uid()::text)
    or
    ((storage.foldername(name))[1] = 'athlete' and exists (
      select 1 from athletes
      where athletes.id::text = (storage.foldername(name))[2]
        and athletes.organisation_id = my_organisation_id()
    ))
  )
);

create policy "Coaches can delete avatars in their own org"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (
    ((storage.foldername(name))[1] = 'coach' and (storage.foldername(name))[2] = auth.uid()::text)
    or
    ((storage.foldername(name))[1] = 'athlete' and exists (
      select 1 from athletes
      where athletes.id::text = (storage.foldername(name))[2]
        and athletes.organisation_id = my_organisation_id()
    ))
  )
);

comment on column coaches.avatar_url is 'Public URL of the coach''s profile picture in the avatars storage bucket';
comment on column athletes.avatar_url is 'Public URL of the athlete''s profile picture in the avatars storage bucket';

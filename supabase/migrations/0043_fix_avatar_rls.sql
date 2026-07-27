-- ============================================================
-- 0043_fix_avatar_rls.sql
-- 0042's storage.objects policies used storage.foldername(name),
-- which didn't match paths the way expected (upload of a coach's own
-- avatar was rejected with "new row violates row-level security
-- policy" even when the path segment matched auth.uid() exactly, per
-- live testing). Replace with split_part(name, '/', n), a plain
-- Postgres built-in with unambiguous behaviour, instead of relying on
-- Supabase's helper.
-- ============================================================

drop policy if exists "Coaches can upload avatars in their own org" on storage.objects;
drop policy if exists "Coaches can replace avatars in their own org" on storage.objects;
drop policy if exists "Coaches can delete avatars in their own org" on storage.objects;

create policy "Coaches can upload avatars in their own org"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (
    (split_part(name, '/', 1) = 'coach' and split_part(name, '/', 2) = auth.uid()::text)
    or
    (split_part(name, '/', 1) = 'athlete' and exists (
      select 1 from athletes
      where athletes.id::text = split_part(name, '/', 2)
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
    (split_part(name, '/', 1) = 'coach' and split_part(name, '/', 2) = auth.uid()::text)
    or
    (split_part(name, '/', 1) = 'athlete' and exists (
      select 1 from athletes
      where athletes.id::text = split_part(name, '/', 2)
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
    (split_part(name, '/', 1) = 'coach' and split_part(name, '/', 2) = auth.uid()::text)
    or
    (split_part(name, '/', 1) = 'athlete' and exists (
      select 1 from athletes
      where athletes.id::text = split_part(name, '/', 2)
        and athletes.organisation_id = my_organisation_id()
    ))
  )
);

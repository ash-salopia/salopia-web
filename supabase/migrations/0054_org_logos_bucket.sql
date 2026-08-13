-- ============================================================
-- 0054_org_logos_bucket.sql
-- ============================================================
-- Creates the org-logos storage bucket that 0021_branding.sql left
-- as a commented-out "run separately in the dashboard" note -- it
-- was never actually run, so BrandingSettings.tsx's logo upload has
-- been failing at runtime (bucket not found) since that feature was
-- built. Public bucket, same reasoning as avatars (0042_avatars.sql):
-- logos render in the coach header on every page load, so they need
-- to be fetchable without a signed-URL round trip.
--
-- Object paths are namespaced by organisation id
-- (`${orgId}/logo.${ext}`, set in BrandingSettings.tsx's
-- handleLogoUpload), so RLS scopes access the same way every other
-- coach-facing table does: my_organisation_id(). Branding isn't
-- owner-gated in the UI (BrandingSettings.tsx takes no role prop,
-- unlike BillingSettings) -- any coach in the org can upload/replace
-- the org's logo, matching that.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('org-logos', 'org-logos', true)
on conflict (id) do nothing;

create policy "Coaches can upload their org's logo"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'org-logos'
  and (storage.foldername(name))[1] = my_organisation_id()::text
);

create policy "Coaches can replace their org's logo"
on storage.objects for update
to authenticated
using (
  bucket_id = 'org-logos'
  and (storage.foldername(name))[1] = my_organisation_id()::text
);

create policy "Coaches can delete their org's logo"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'org-logos'
  and (storage.foldername(name))[1] = my_organisation_id()::text
);

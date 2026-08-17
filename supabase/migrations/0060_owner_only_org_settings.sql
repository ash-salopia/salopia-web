-- ============================================================
-- 0060_owner_only_org_settings.sql
-- ============================================================
-- The "owner" vs "coach" role (0001_organisations_and_coaches.sql)
-- already gates billing and team management (invite/revoke/archive -
-- see app/api/coaches/{invite,revoke,archive} and app/api/billing/*),
-- but the organisations row itself (settings/branding jsonb columns -
-- one_rm_formula, checkin_rules, power_speed_benchmarks, branding
-- etc.) was still updatable by ANY coach in the org, not just the
-- owner. Tightened to match the existing owner-only pattern, per
-- Ash's decision on 2026-08-16 - previously any coach on a multi-
-- coach team could change squad-wide config.
-- ============================================================

create or replace function my_coach_role()
returns text
language sql
security definer
stable
as $$
  select role from coaches where id = auth.uid()
$$;

drop policy if exists "Coaches update own organisation" on organisations;

create policy "Only owners update own organisation" on organisations
  for update
  using (id = my_organisation_id() and my_coach_role() = 'owner')
  with check (id = my_organisation_id() and my_coach_role() = 'owner');

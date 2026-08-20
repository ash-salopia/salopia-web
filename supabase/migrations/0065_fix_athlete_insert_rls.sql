-- ============================================================
-- 0065_fix_athlete_insert_rls.sql
-- ============================================================
-- 0064's single "FOR ALL" policy on athletes combined a restricted
-- USING clause (coach_can_access_athlete(id)) with a plain org-only
-- WITH CHECK for insert, intending insert to only ever need the org
-- check - coach_can_access_athlete queries the athletes table itself,
-- which is circular for a row that doesn't exist yet. In practice
-- this still broke every insert with a 42501 RLS violation even
-- though the WITH CHECK clause alone was satisfied (confirmed live:
-- the submitted organisation_id exactly matched my_organisation_id()
-- for the inserting coach) - something about the combined ALL policy
-- still evaluates USING during insert in this environment. Splitting
-- into command-specific policies removes the ambiguity entirely -
-- insert only ever evaluates the insert policy's own check, which
-- never references athletes at all.
-- ============================================================

drop policy if exists "Coaches manage own org athletes" on athletes;

create policy "Coaches create own org athletes" on athletes
  for insert with check (organisation_id = my_organisation_id());

create policy "Coaches view assigned athletes" on athletes
  for select using (coach_can_access_athlete(id));

create policy "Coaches update assigned athletes" on athletes
  for update using (coach_can_access_athlete(id))
  with check (coach_can_access_athlete(id));

create policy "Coaches delete assigned athletes" on athletes
  for delete using (coach_can_access_athlete(id));

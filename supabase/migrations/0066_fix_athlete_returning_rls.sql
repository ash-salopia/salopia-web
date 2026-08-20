-- ============================================================
-- 0066_fix_athlete_returning_rls.sql
-- ============================================================
-- coach_can_access_athlete() re-queries athletes internally (select 1
-- from athletes where id = ...). Postgres applies a table's SELECT
-- policy to whatever an INSERT ... RETURNING hands back, and that
-- self-referential subquery can't see the row the same INSERT just
-- created - so the check failed even for the athlete's own creator,
-- confirmed live (0065's split didn't fix it, since the SELECT policy
-- governing RETURNING still went through the same function).
--
-- The other 19 tables migrated in 0064 don't hit this: they always
-- reference an athlete that already exists as a prior, committed row
-- (you can't log a session before the athlete exists), so this
-- circularity is specific to the athletes table checking itself.
--
-- Fix: a version of the check that takes the row's own id/
-- organisation_id directly (available immediately from the row being
-- evaluated) instead of looking them up via a fresh athletes query.
-- ============================================================

create or replace function coach_owns_athlete_row(target_athlete_id uuid, target_org_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from coaches c
    where c.id = auth.uid()
      and c.archived = false
      and c.organisation_id = target_org_id
      and (
        c.role = 'owner'
        or c.athlete_access = 'all'
        or exists (select 1 from coach_athletes ca where ca.coach_id = c.id and ca.athlete_id = target_athlete_id)
      )
  )
$$;

drop policy if exists "Coaches view assigned athletes" on athletes;

create policy "Coaches view assigned athletes" on athletes
  for select using (coach_owns_athlete_row(id, organisation_id));

drop policy if exists "Coaches update assigned athletes" on athletes;

create policy "Coaches update assigned athletes" on athletes
  for update using (coach_owns_athlete_row(id, organisation_id))
  with check (coach_owns_athlete_row(id, organisation_id));

drop policy if exists "Coaches delete assigned athletes" on athletes;

create policy "Coaches delete assigned athletes" on athletes
  for delete using (coach_owns_athlete_row(id, organisation_id));

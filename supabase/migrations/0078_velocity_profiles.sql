-- ============================================================
-- 0078_velocity_profiles.sql
-- ============================================================
-- Per-athlete, per-exercise load-velocity profile for VBT-estimated
-- 1RM - a coach enters a handful of (load, velocity) test points, the
-- app fits a linear regression (velocity = slope*load + intercept)
-- and stores it alongside a minimum velocity threshold (mvt), the
-- load at which that line crosses "too slow to be a rep" for this
-- lift. Same shape/convention as athlete_one_rms (0038) - a coach-set
-- per-athlete-per-exercise row, upserted by name - but this is a
-- separate, complementary estimate (velocity-derived), not a
-- replacement for the existing rep-based e1RM system.
--
-- slope/intercept are stored (not refit on every report read) since
-- they only change when the coach re-calibrates; calibration_points
-- is kept too so the coach can see/edit the raw data behind the fit,
-- not just the derived numbers.
-- ============================================================

create table athlete_velocity_profiles (
  id                 uuid primary key default gen_random_uuid(),
  athlete_id         uuid not null references athletes(id) on delete cascade,
  exercise_name      text not null,
  mvt                numeric not null,
  calibration_points jsonb not null,
  slope              numeric not null,
  intercept          numeric not null,
  updated_at         timestamptz not null default now(),
  unique (athlete_id, exercise_name)
);

create index athlete_velocity_profiles_athlete_id_idx on athlete_velocity_profiles(athlete_id);

alter table athlete_velocity_profiles enable row level security;

create policy "Coaches manage athlete velocity profiles" on athlete_velocity_profiles
  for all using (
    exists (
      select 1 from athletes a
      where a.id = athlete_velocity_profiles.athlete_id
        and a.organisation_id = my_organisation_id()
    )
  )
  with check (
    exists (
      select 1 from athletes a
      where a.id = athlete_velocity_profiles.athlete_id
        and a.organisation_id = my_organisation_id()
    )
  );

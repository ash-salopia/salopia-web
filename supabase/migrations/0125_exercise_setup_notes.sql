-- ============================================================
-- 0125_exercise_setup_notes.sql
-- ============================================================
-- Recurring per-exercise notes an athlete keeps for themselves, e.g.
-- "Leg press: seat 4, feet high on the plate" or "Cable row: pin 6".
-- Unlike session_exercises.athlete_exercise_notes (one note on one
-- session's exercise), a setup note belongs to the athlete + exercise
-- name and shows every time that exercise appears in any session.
--
-- Athletes read/write through the service-role athlete-link route
-- (token-resolved, like every athlete write); coaches can see (and
-- edit) their athletes' setups through RLS.
-- ============================================================

create table if not exists athlete_exercise_setups (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  athlete_id      uuid not null references athletes(id) on delete cascade,
  exercise_key    text not null,  -- lower(trim(name)), so "Leg Press" and "leg press" share one note
  exercise_name   text not null,
  note            text not null,
  updated_at      timestamptz not null default now(),
  unique (athlete_id, exercise_key)
);

create index if not exists athlete_exercise_setups_athlete_idx on athlete_exercise_setups(athlete_id);

alter table athlete_exercise_setups enable row level security;

drop policy if exists "Coaches manage athlete exercise setups" on athlete_exercise_setups;
create policy "Coaches manage athlete exercise setups" on athlete_exercise_setups
  for all
  using (coach_can_access_athlete(athlete_id))
  with check (coach_can_access_athlete(athlete_id) and organisation_id = my_organisation_id());

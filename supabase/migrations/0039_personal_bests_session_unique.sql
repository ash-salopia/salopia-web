-- ============================================================
-- 0039_personal_bests_session_unique.sql
-- ============================================================
-- Closes a race in detectPB (app/api/athlete-link/log/route.ts): two
-- near-simultaneous set saves for the same session+exercise could
-- both read "no PB row exists yet" before either had finished
-- writing, and both insert — producing a duplicate. This constraint
-- makes the database itself the single source of truth for "does a
-- PB already exist for this session", so a concurrent write lands as
-- an update via upsert instead of a second row, no matter how close
-- together the requests land.
--
-- Manual PB entries (session_id is null, created from the athlete
-- profile's "Add PB" button) are unaffected — Postgres treats NULLs
-- as distinct from each other in a unique constraint, so they never
-- conflict with one another or with session-linked rows.
-- ============================================================

alter table personal_bests
  add constraint personal_bests_athlete_exercise_session_unique
  unique (athlete_id, exercise_name, session_id);

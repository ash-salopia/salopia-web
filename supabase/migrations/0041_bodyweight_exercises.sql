-- ============================================================
-- 0041_bodyweight_exercises.sql
-- ============================================================
-- Explicit "bodyweight only" flag on an exercise, set by the coach
-- while programming (e.g. Chin Up) rather than inferred from whether
-- a weight happens to be blank — the schema already had a
-- weight_kg-nullable convention for this (see 0010_community.sql's
-- comment), but nothing ever set it deliberately, and the one
-- existing attempt at detecting it (detectPB in
-- app/api/athlete-link/detect-pb/route.ts) was dead code: it always
-- returned before inserting a 0-weight PB. This migration plus the
-- accompanying app changes replace that inference with a real flag,
-- and add time-based PBs (e.g. a plank hold) alongside weight/reps.
--
-- time_seconds is nullable and only ever set for a bodyweight
-- exercise logged in "time" mode (see RepsTimeField / SetLog.time) —
-- weighted and reps-based bodyweight PBs leave it null, exactly like
-- weight_kg is already left null for a reps-based bodyweight PB.
-- ============================================================

alter table session_exercises add column if not exists is_bodyweight boolean not null default false;
alter table personal_bests add column if not exists time_seconds numeric;

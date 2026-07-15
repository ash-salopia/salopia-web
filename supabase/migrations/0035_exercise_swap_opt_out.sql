-- ============================================================
-- 0035_exercise_swap_opt_out.sql
-- ============================================================
-- Lets an athlete swap a prescribed exercise for an alternative, or
-- opt out of it entirely, in the moment while logging a session —
-- without touching their actual assigned programme. A coach can
-- pre-approve alternatives for a specific exercise instance; the
-- athlete can also freely pick any exercise from the org's library.
--
-- No RLS changes needed — these are new columns on the existing
-- session_exercises table, already covered by its row-level policies
-- (0004_sessions_and_exercises.sql). Athlete-side reads/writes go
-- through the athlete-link routes (service-role + manual ownership
-- check), same pattern as every other athlete write path.
-- ============================================================

alter table session_exercises add column if not exists alternative_names text[] not null default '{}';
alter table session_exercises add column if not exists swapped_from text;
alter table session_exercises add column if not exists opted_out boolean not null default false;

-- ============================================================
-- 0090_track_pause.sql
-- ============================================================
-- Coach-set flag on a strength exercise, same pattern as track_velocity
-- (0067):
--
-- track_pause  — show a "pause (s)" box per set, for paused-tempo work
--                (paused squat / bench / deadlift). target_pause is the
--                optional prescribed hold. The logged value per set lives
--                in session_exercises.log[i].pause, which needs no
--                migration since log is jsonb.
--
-- Feeds the Live Group / session "Best:" progression signal — same
-- weight and reps but a longer pause reads as progress.
-- ============================================================

alter table session_exercises
  add column if not exists track_pause  boolean not null default false,
  add column if not exists target_pause text not null default '';

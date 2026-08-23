-- ============================================================
-- 0067_completion_only_and_velocity.sql
-- ============================================================
-- Two independent coach-set flags on an exercise, same pattern as
-- is_bodyweight (0041) and use_percent_1rm (0045):
--
-- completion_only — nothing to track for this exercise (e.g. a
-- mobility drill or warm-up). Logging becomes a plain done tick per
-- set, no weight/reps/time boxes at all.
--
-- track_velocity — show a bar speed (m/s) box per set, for
-- velocity-based training. target_velocity is the optional
-- prescribed goal speed, shown alongside whatever the athlete/coach
-- actually logs; the logged value itself lives in session_exercises
-- .log[i].velocity, which needs no migration since log is jsonb.
-- ============================================================

alter table session_exercises
  add column if not exists completion_only boolean not null default false,
  add column if not exists track_velocity boolean not null default false,
  add column if not exists target_velocity text not null default '';

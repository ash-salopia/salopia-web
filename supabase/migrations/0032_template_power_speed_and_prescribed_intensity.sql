-- ============================================================
-- 0032_template_power_speed_and_prescribed_intensity.sql
-- ============================================================
-- Two pieces of groundwork for the programme-templates CSV import:
--
-- A) template_defs/programme_sessions.type didn't allow 'power_speed',
--    even though sessions.type already does and SessionReviewEditor's
--    own type selector already offers "Power / Speed" — so saving a
--    power_speed template via the existing Voice/Notes flows already
--    fails with a constraint violation today. This fixes that.
--
-- B) Per-exercise RPE and %1RM as real structured fields (rather than
--    folded into the free-text target_load field). session_exercises
--    is a typed table and needs a real column; template_defs.exercises
--    / programme_sessions.exercises are JSONB and need no migration
--    to carry the same two keys.
-- ============================================================

alter table template_defs drop constraint if exists template_defs_type_check;
alter table template_defs add constraint template_defs_type_check
  check (type in ('strength', 'hyrox', 'cardio', 'power_speed'));

alter table programme_sessions drop constraint if exists programme_sessions_type_check;
alter table programme_sessions add constraint programme_sessions_type_check
  check (type in ('strength', 'hyrox', 'cardio', 'power_speed'));

alter table session_exercises add column if not exists rpe numeric;
alter table session_exercises add column if not exists percent_1rm numeric;

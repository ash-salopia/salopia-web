-- ============================================================
-- 0040_athlete_exercise_notes.sql
-- ============================================================
-- Lets an athlete leave a note on an individual exercise (e.g. "left
-- shoulder felt tight on this one"), separate from both the coach's
-- prescription note (session_exercises.notes) and the athlete's
-- session-level note (sessions.athlete_notes from 0033).
--
-- Note: session_exercises already had an unused `session_notes`
-- column since 0004 (dead — nothing in the app reads or writes it,
-- and its name would be misleading here since it doesn't indicate
-- athlete authorship). Adding a clearly-named column instead of
-- repurposing it.
-- ============================================================

alter table session_exercises add column if not exists athlete_exercise_notes text default '';

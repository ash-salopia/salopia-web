-- ============================================================
-- 0033_athlete_session_notes.sql
-- ============================================================
-- session_notes (0017) is coach-authored (warm-up cues, protocols) and
-- shared with the athlete read-only — athletes writing to that same
-- column would overwrite the coach's notes. This adds a separate
-- column for the athlete's own note on a session (e.g. "felt tired
-- today", "knee was a bit sore"), editable only by the athlete via
-- the athlete-link routes, and visible read-only to the coach.
-- ============================================================

alter table sessions add column if not exists athlete_notes text default '';

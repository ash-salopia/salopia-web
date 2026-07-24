-- ============================================================
-- 0037_backfill_unacknowledged_notes.sql
-- ============================================================
-- 0036 added athlete_notes_acknowledged defaulting to true, which
-- correctly means "no note to review" for sessions with no note — but
-- it also retroactively marked every note written BEFORE 0036 shipped
-- as already acknowledged, even though the coach never actually saw
-- the new dashboard panel to dismiss them. One-time backfill: any
-- session with a real note gets flipped back to unread so it surfaces.
-- ============================================================

update sessions
set athlete_notes_acknowledged = false
where athlete_notes is not null and athlete_notes <> '';

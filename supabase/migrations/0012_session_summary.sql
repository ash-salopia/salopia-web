-- ============================================================
-- 0012_session_summary.sql
-- ============================================================
-- Adds a coach_summary field to sessions so AI-generated
-- session summaries can be saved and retrieved without
-- regenerating them on every page load.
-- ============================================================

alter table sessions add column if not exists coach_summary text not null default '';

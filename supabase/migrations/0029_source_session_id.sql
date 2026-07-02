-- ============================================================
-- 0029_source_session_id.sql
-- Tracks which session a copy was made from so the coach can
-- propagate exercise changes to all future occurrences.
-- Applies to sessions created via copy/repeat OR loaded from
-- a programme/template — both flows now store the source ID.
-- ============================================================

alter table sessions
  add column if not exists source_session_id uuid references sessions(id) on delete set null;

create index if not exists sessions_source_session_id_idx
  on sessions(source_session_id);

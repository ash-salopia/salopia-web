-- ============================================================
-- 0104_ps_count_contacts.sql
-- "Count contacts" toggle for Power/Speed exercises (plyometric only).
--
-- Contacts are auto-totalled in the session-totals bar as
-- sets x reps (see PowerSpeedSummaryBar), but not every exercise a
-- coach classifies as "plyometric" is actually a ground-contact
-- movement in the tissue-load sense a coach cares about for that
-- total - e.g. Box Jumps clearly are, but a Med Ball Rotational Throw
-- is an explosive/plyometric movement with no landing impact at all,
-- and its "reps" shouldn't inflate the contacts total.
--
--  * session_exercises.count_contacts — per-exercise override, ticked
--    by default; a coach unticks it for a specific exercise (e.g. a
--    throw) that shouldn't count toward the session's contacts total.
--  * library_entries.default_count_contacts — the library's own
--    default for that exercise, so a coach only has to make the call
--    once per exercise rather than every time it's added to a session.
-- ============================================================

alter table session_exercises
  add column if not exists count_contacts boolean not null default true;

alter table library_entries
  add column if not exists default_count_contacts boolean not null default true;

comment on column session_exercises.count_contacts is 'Whether this exercise''s reps count toward the session''s "Plyo contacts" total (plyometric quality only) - default true, unticked for non-landing plyometric movements like a med ball throw (0104)';
comment on column library_entries.default_count_contacts is 'Default for session_exercises.count_contacts when this library entry is added to a session (0104)';

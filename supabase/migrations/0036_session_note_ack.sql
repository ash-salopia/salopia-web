-- ============================================================
-- 0036_session_note_ack.sql
-- ============================================================
-- Lets a coach clear an athlete's session note off the dashboard once
-- they've read it and confirmed no action is needed, without having
-- to open the session itself. Defaults to true (acknowledged) so
-- existing sessions and ones with no note never show up as unread.
-- Reset to false whenever the athlete writes a new/changed note (see
-- updateAthleteSessionNotes in lib/data/athlete-share-link.ts).
-- ============================================================

alter table sessions add column if not exists athlete_notes_acknowledged boolean not null default true;

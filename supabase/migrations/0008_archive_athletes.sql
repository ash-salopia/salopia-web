-- ============================================================
-- 0008_archive_athletes.sql
-- ============================================================
-- Adds soft-delete ("archive") support for athletes. Archiving hides
-- an athlete from the main roster without touching any of their
-- data — sessions, logged history, everything stays exactly as it
-- was, and an archived athlete's share link still works (a coach may
-- still want to view an old athlete's history, or temporarily hide
-- someone who's paused training without losing their record).
--
-- Deliberately a boolean flag rather than moving rows to a separate
-- "archived_athletes" table — much simpler, and every existing query
-- (sessions, reports, programme assignments) keeps working unchanged
-- since the athlete row and its id never move.
-- ============================================================

alter table athletes add column archived boolean not null default false;

-- Most queries only want active athletes — this partial index keeps
-- the common case (listing the active roster) fast without indexing
-- archived rows that are rarely queried by this filter.
create index athletes_organisation_id_active_idx
  on athletes(organisation_id)
  where archived = false;

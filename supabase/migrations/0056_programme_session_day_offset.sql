-- ============================================================
-- 0056_programme_session_day_offset.sql
-- ============================================================
-- "Save as programme" snapshots a real date range off an athlete's
-- calendar, but until now only kept sessions in relative order
-- (sort_order) - the actual day pattern (e.g. Upper day 1, Lower day
-- 2, rest day 3, Upper day 4...) was lost, so rest days silently
-- collapsed when the programme was later loaded back onto a
-- calendar. day_offset records each session's day number relative to
-- the first session in the saved range (0-indexed: the first session
-- is day_offset 0), so "Load onto athlete" can reproduce the exact
-- original spacing - pick a start date, day_offset 0 lands on it, and
-- every other session/rest-day gap follows from there.
--
-- Existing rows predate this and never had real dates to derive it
-- from, so they're backfilled from sort_order (one session per day,
-- no rest days) - the same effective spacing "Load onto athlete"
-- already assumed before this migration.
-- ============================================================

alter table programme_sessions add column if not exists day_offset int not null default 0;

update programme_sessions set day_offset = sort_order where day_offset = 0 and sort_order <> 0;

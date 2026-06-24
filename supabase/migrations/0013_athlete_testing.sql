-- ============================================================
-- 0013_athlete_testing.sql
-- ============================================================
-- Adds testing schedule fields to athletes so the dashboard
-- can flag when a test week is due.
--
-- last_test_date:  the date the athlete last completed a test week
-- retest_weeks:    how many weeks until the next test is due
--                  e.g. last_test_date=2024-01-01, retest_weeks=6
--                  → next test due 2024-02-12
-- ============================================================

alter table athletes
  add column if not exists last_test_date date,
  add column if not exists retest_weeks   integer;

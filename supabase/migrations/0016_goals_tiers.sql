-- ============================================================
-- 0016_goals_tiers.sql
-- ============================================================
-- Adds target_date and tier to athlete_goals so coaches can
-- set deadlines and mark goals as primary or secondary.
-- ============================================================

alter table athlete_goals
  add column if not exists target_date date,
  add column if not exists tier text check (tier in ('primary', 'secondary'))
    default null;

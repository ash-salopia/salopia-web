-- ============================================================
-- 0028_athlete_bodyweight.sql
-- Add bodyweight_kg to athletes so it can be used as the
-- default value when logging test sessions (IMTP N/kg).
-- ============================================================

alter table athletes
  add column if not exists bodyweight_kg numeric(5,1);

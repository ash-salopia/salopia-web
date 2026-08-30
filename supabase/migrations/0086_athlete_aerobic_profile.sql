-- ============================================================
-- 0086_athlete_aerobic_profile.sql
-- ============================================================
-- Per-athlete aerobic inputs that drive the 5-zone training-zone
-- model (lib/training-zones.ts):
--   max_hr     — measured or age-estimated maximum heart rate (bpm)
--   resting_hr — resting heart rate (bpm); when present, HR zones use
--                the Karvonen / heart-rate-reserve method instead of
--                plain %HRmax
--   mas_kmh    — Maximal Aerobic Speed (km/h), from a field test or
--                the coach's estimate; drives per-zone pace/speed
--
-- Discrete nullable columns on athletes, same convention as
-- bodyweight_kg (0028) and last_test_date / retest_weeks (0013).
-- getAthleteByShareToken already does select("*"), so these reach
-- the athlete app automatically once the Athlete type includes them.
-- ============================================================

alter table athletes
  add column if not exists max_hr     int,
  add column if not exists resting_hr int,
  add column if not exists mas_kmh    numeric;

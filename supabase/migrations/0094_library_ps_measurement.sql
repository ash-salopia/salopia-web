-- ============================================================
-- 0094_library_ps_measurement.sql
-- ============================================================
-- A Power/Speed library exercise can pre-set the per-rep measurement
-- it's logged against — Time / Height / Distance / RSI / Power /
-- Velocity / None. When the exercise is picked in a Power/Speed
-- session, the measurement selector fills automatically (e.g. an
-- "MB Throw" entry set to "None" adds with no per-rep metric box).
--
-- Values mirror PowerSpeedExerciseCard's MeasurementType:
--   'time_s' | 'height_cm' | 'distance_m' | 'rsi' | 'power_w' | 'velocity_ms' | 'none'
-- null = no default (falls back to the movement quality's default).
-- ============================================================

alter table library_entries
  add column if not exists default_measurement_type text;

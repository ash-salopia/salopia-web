-- ============================================================
-- 0018_power_speed_session_fields.sql
-- ============================================================
-- Additional fields needed for Power/Speed exercise cards.
-- Run AFTER 0017_power_speed_and_session_notes.sql
-- ============================================================

-- distance, height, contacts, intensity_label, rest_seconds
-- should already exist from migration 0017.
-- This migration adds nothing new to the schema but documents
-- the field reuse for power/speed sessions:
--
--   intensity_label  → stores the quality category
--                      (acceleration / max_velocity / plyometric / cod / deceleration)
--   target_load      → stores the surface type (Grass / Track / Turf etc.)
--   distance         → sprint distance or jump distance
--   contacts         → plyometric contacts per set
--   rest             → rest period (text)
--   log (JSONB)      → PSSetLog shape:
--                      { done, result, contact_time, rsi, rpe, pain, notes }
--
-- No schema changes needed — existing columns cover all fields.

SELECT 'Power/Speed session fields ready — no schema changes needed' AS status;

-- Verify the columns exist
SELECT column_name FROM information_schema.columns
WHERE table_name = 'session_exercises'
  AND column_name IN ('distance', 'contacts', 'intensity_label', 'rest_seconds', 'complex_group')
ORDER BY column_name;

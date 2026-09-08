-- ============================================================
-- 0017_power_speed_and_session_notes.sql
-- ============================================================
-- 1. Add Power/Speed as a 4th session type
-- 2. Add session_notes to all sessions (warm-up cues, protocols)
-- 3. Add power/speed fields to session_exercises
-- 4. Add French Contrast / complex block grouping fields
-- 5. Restore exercise_notes field (was lost from UI)
-- 6. Add Power/Speed exercises to the library
-- ============================================================

-- 1. Add power_speed to session type
-- Postgres requires ADD VALUE for enum changes. Guarded because
-- sessions.type is a plain text column with a CHECK constraint in this
-- schema (see 0004 / 0032 / 0046) — the `session_type` enum only exists
-- on databases where it was created out of band. No-op where it isn't.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'session_type') THEN
    ALTER TYPE session_type ADD VALUE IF NOT EXISTS 'power_speed';
  END IF;
END $$;

-- 2. Session notes block (free text, all session types)
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS session_notes TEXT;

-- 3. Power/Speed fields on session_exercises
-- All nullable so existing strength/cardio/hyrox sessions are unaffected
ALTER TABLE session_exercises
  ADD COLUMN IF NOT EXISTS distance         TEXT,        -- e.g. "10m", "20m", "40m"
  ADD COLUMN IF NOT EXISTS height           TEXT,        -- e.g. "60cm", "0.75m"
  ADD COLUMN IF NOT EXISTS contacts         INTEGER,     -- plyometric contacts per set
  ADD COLUMN IF NOT EXISTS intensity_label  TEXT,        -- e.g. "Maximal", "Submaximal", "80%"
  ADD COLUMN IF NOT EXISTS rest_seconds     INTEGER;     -- rest between sets in seconds

-- 4. French Contrast / complex block grouping
ALTER TABLE session_exercises
  ADD COLUMN IF NOT EXISTS complex_group      TEXT,      -- "Complex A", "French Contrast 1"
  ADD COLUMN IF NOT EXISTS complex_group_rest INTEGER;   -- rest between complex repeats (seconds)

-- 5 + 6. Seed Power/Speed rows into a legacy `exercises` table IF one
-- exists with a `category` column. No such table exists in this schema
-- (the library lives in library_entries) — this whole block is a no-op
-- here. Wrapped in EXECUTE so the INSERT is not parsed (and cannot fail
-- on a missing relation) when the table is absent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exercises' AND column_name = 'category'
  ) THEN
    RAISE NOTICE 'exercises.category found — inserting Power/Speed rows';
    EXECUTE $ins$
      INSERT INTO exercises (id, name, category, description)
      SELECT * FROM (VALUES
        (gen_random_uuid(), 'Acceleration Sprint',        'Power/Speed', 'Short sprint focusing on drive phase, 10-30m'),
        (gen_random_uuid(), 'Flying Sprint',              'Power/Speed', 'Sprint with rolling start, measuring top speed phase'),
        (gen_random_uuid(), 'Resisted Sprint',            'Power/Speed', 'Sprint with sled or band resistance'),
        (gen_random_uuid(), 'Pro Agility (5-10-5)',       'Power/Speed', 'Change of direction drill'),
        (gen_random_uuid(), 'T-Drill',                    'Power/Speed', 'Agility drill: forward, lateral, back'),
        (gen_random_uuid(), 'Box Jump',                   'Power/Speed', 'Explosive jump onto box'),
        (gen_random_uuid(), 'Depth Jump',                 'Power/Speed', 'Step off box, immediate maximal rebound jump'),
        (gen_random_uuid(), 'Broad Jump',                 'Power/Speed', 'Maximal horizontal jump for distance'),
        (gen_random_uuid(), 'Hurdle Hop',                 'Power/Speed', 'Continuous hops over hurdles'),
        (gen_random_uuid(), 'Single Leg Box Jump',        'Power/Speed', 'Unilateral explosive jump onto box'),
        (gen_random_uuid(), 'Drop Jump',                  'Power/Speed', 'Drop from height, minimal ground contact time'),
        (gen_random_uuid(), 'Countermovement Jump (CMJ)', 'Power/Speed', 'Standard vertical jump with arm swing'),
        (gen_random_uuid(), 'Squat Jump',                 'Power/Speed', 'Jump from static squat position, no countermovement'),
        (gen_random_uuid(), 'Loaded CMJ',                 'Power/Speed', 'CMJ with barbell or dumbbell load (20-40% BW)'),
        (gen_random_uuid(), 'MB Chest Pass',              'Power/Speed', 'Explosive horizontal power, upper body'),
        (gen_random_uuid(), 'MB Overhead Throw',          'Power/Speed', 'Explosive overhead slam or throw for height'),
        (gen_random_uuid(), 'MB Rotational Throw',        'Power/Speed', 'Rotational power, stand side-on to wall'),
        (gen_random_uuid(), 'MB Slam',                    'Power/Speed', 'Overhead slam, full body power expression'),
        (gen_random_uuid(), 'Band-Resisted Jump',         'Power/Speed', 'Jump with band around hips adding eccentric load'),
        (gen_random_uuid(), 'Weighted Vest Jump',         'Power/Speed', 'CMJ or squat jump wearing weighted vest'),
        (gen_random_uuid(), 'Lateral Bound',              'Power/Speed', 'Single leg lateral jump, reactive on landing'),
        (gen_random_uuid(), 'Reactive COD',               'Power/Speed', 'Coach-cued change of direction, reactive speed'),
        (gen_random_uuid(), 'Cone Weave',                 'Power/Speed', 'Slalom through cones, acceleration and deceleration')
      ) AS v(id, name, category, description)
      ON CONFLICT DO NOTHING
    $ins$;
  ELSE
    RAISE NOTICE 'no exercises table — skipping Power/Speed seed rows (expected)';
  END IF;
END $$;

-- ============================================================
-- Verification
-- ============================================================
SELECT 'session_exercises columns:' AS info;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'session_exercises'
ORDER BY ordinal_position;

SELECT 'sessions columns:' AS info;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'sessions'
ORDER BY ordinal_position;

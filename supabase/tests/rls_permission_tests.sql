-- ============================================================
-- rls_permission_tests.sql
-- ============================================================
-- Manual verification of the RLS policies in migrations 0001-0005.
-- Run this against a test/staging Supabase project AFTER applying
-- all migrations - never against production data, since it creates
-- and deletes real rows.
--
-- HOW TO RUN: paste into the Supabase SQL Editor and run section by
-- section, reading the comments before each block. This can't be
-- fully automated from the SQL editor alone (it needs two different
-- authenticated users), so the structure below sets up the data as
-- the database owner, then the actual cross-organisation checks need
-- to be run from the app (or via the Supabase client with two real
-- logged-in test accounts) - see the checklist at the bottom.
--
-- The core question every check answers: "If Coach A from
-- Organisation A is logged in, can they see or change ANYTHING
-- belonging to Organisation B?" The answer must always be no.
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1: Set up two separate organisations with one coach each,
-- and one athlete each, so there's real cross-org data to test
-- against. Run this as the database owner (bypasses RLS).
-- ------------------------------------------------------------

insert into organisations (id, name) values
  ('00000000-0000-0000-0000-00000000000a', 'Test Org A'),
  ('00000000-0000-0000-0000-00000000000b', 'Test Org B');

-- NOTE: coaches.id must match a real auth.users row (foreign key).
-- Create two real test users via Supabase Auth first (e.g. through
-- the dashboard's Authentication tab, or supabase.auth.admin.createUser
-- via the service role key in a script), then substitute their real
-- UUIDs below before running this insert.
--
-- insert into coaches (id, organisation_id, name, role) values
--   ('<real-auth-user-id-for-coach-a>', '00000000-0000-0000-0000-00000000000a', 'Coach A', 'owner'),
--   ('<real-auth-user-id-for-coach-b>', '00000000-0000-0000-0000-00000000000b', 'Coach B', 'owner');

insert into athletes (id, organisation_id, name) values
  ('00000000-0000-0000-0000-00000000001a', '00000000-0000-0000-0000-00000000000a', 'Athlete A'),
  ('00000000-0000-0000-0000-00000000001b', '00000000-0000-0000-0000-00000000000b', 'Athlete B');

insert into library_entries (id, organisation_id, name) values
  ('00000000-0000-0000-0000-00000000002a', '00000000-0000-0000-0000-00000000000a', 'Squat (Org A)'),
  ('00000000-0000-0000-0000-00000000002b', '00000000-0000-0000-0000-00000000000b', 'Squat (Org B)');

-- ------------------------------------------------------------
-- STEP 2: Cross-organisation checks to run AS COACH A (i.e. with
-- Coach A's session/JWT active - either via the app while logged in
-- as Coach A, or via supabase-js with Coach A's access token).
--
-- Every query below is run as Coach A. Every "should be 0 rows" /
-- "should fail" assertion is the actual security boundary - if any
-- of these return Org B's data, or successfully modify it, RLS has
-- a hole and must be fixed before going further.
-- ------------------------------------------------------------

-- 2a. Listing athletes should ONLY return Athlete A, never Athlete B.
--     select * from athletes;
--     ASSERT: exactly 1 row, name = 'Athlete A'

-- 2b. Directly selecting Org B's athlete by ID should return nothing
--     (RLS silently filters it out, rather than erroring).
--     select * from athletes where id = '00000000-0000-0000-0000-00000000001b';
--     ASSERT: 0 rows

-- 2c. Attempting to UPDATE Org B's athlete should affect 0 rows.
--     update athletes set name = 'Hacked' where id = '00000000-0000-0000-0000-00000000001b';
--     ASSERT: 0 rows updated (check the affected row count, not just "no error")

-- 2d. Attempting to DELETE Org B's athlete should affect 0 rows.
--     delete from athletes where id = '00000000-0000-0000-0000-00000000001b';
--     ASSERT: 0 rows deleted

-- 2e. Listing library entries should ONLY return Org A's entry.
--     select * from library_entries;
--     ASSERT: exactly 1 row, name = 'Squat (Org A)'

-- 2f. Attempting to INSERT a session for Org B's athlete should fail
--     (the with check clause blocks it, since the athlete doesn't
--     belong to Coach A's organisation).
--     insert into sessions (athlete_id, date) values ('00000000-0000-0000-0000-00000000001b', '2026-06-20');
--     ASSERT: insert fails with a policy violation error

-- 2g. Repeat checks 2a-2f for: templates, programmes, test_batteries,
--     test_metrics, test_sessions - same pattern, same expected
--     result (Org A only, Org B invisible and unmodifiable).

-- ------------------------------------------------------------
-- STEP 3: Same-organisation checks, run as Coach A, to confirm
-- legitimate access still works (RLS should be strict but not
-- ALSO accidentally block a coach from their own org's data).
-- ------------------------------------------------------------

-- 3a. Coach A should be able to read, update, and delete Athlete A.
--     select * from athletes where id = '00000000-0000-0000-0000-00000000001a';
--     ASSERT: 1 row returned

-- 3b. Coach A should be able to create a new athlete in their org.
--     insert into athletes (organisation_id, name) values ('00000000-0000-0000-0000-00000000000a', 'New Athlete');
--     ASSERT: insert succeeds

-- 3c. Coach A should NOT be able to create an athlete in Org B,
--     even by directly specifying organisation_id = Org B's id.
--     insert into athletes (organisation_id, name) values ('00000000-0000-0000-0000-00000000000b', 'Sneaky Athlete');
--     ASSERT: insert fails with a policy violation error

-- ------------------------------------------------------------
-- STEP 4: Cleanup - remove all test data once checks pass.
-- ------------------------------------------------------------
-- delete from athletes where organisation_id in ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b');
-- delete from library_entries where organisation_id in ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b');
-- delete from coaches where organisation_id in ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b');
-- delete from organisations where id in ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b');

-- ============================================================
-- CHECKLIST - tick each off after manually verifying via the app
-- or supabase-js with two real logged-in test accounts:
-- ============================================================
-- [ ] Coach A cannot see Org B's athletes (2a, 2b)
-- [ ] Coach A cannot modify or delete Org B's athletes (2c, 2d)
-- [ ] Coach A cannot see Org B's library entries (2e)
-- [ ] Coach A cannot create sessions for Org B's athletes (2f)
-- [ ] Same checks pass for templates, programmes, test data (2g)
-- [ ] Coach A CAN read/write their own organisation's data (3a, 3b)
-- [ ] Coach A cannot insert data tagged with Org B's organisation_id,
--     even when explicitly specifying it (3c) - this is the check
--     that confirms the "with check" clauses are doing real work,
--     not just the "using" clauses

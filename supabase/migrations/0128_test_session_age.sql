-- Age at test, typed by the coach for athletes with no date of birth on
-- their profile. When a DOB exists the app always calculates age from it
-- (so a later DOB correction fixes old sessions too); this column is the
-- fallback that norms/benchmarks use when there's no DOB.
alter table test_sessions
  add column if not exists age_years integer check (age_years between 3 and 100);

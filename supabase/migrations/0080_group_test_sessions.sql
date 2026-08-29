-- ============================================================
-- 0080_group_test_sessions.sql
-- ============================================================
-- Group testing: a coach runs a whole squad through one battery on
-- one day. This is a thin wrapper over the existing per-athlete
-- test_sessions / test_results model, NOT a new results store.
--
-- A group_test_sessions row is just a named parent (battery + date).
-- Each athlete in it still gets a normal test_sessions row - that row
-- IS the membership and holds all the trials, exactly as a
-- single-athlete "Log Session" would. So everything downstream (the
-- per-athlete testing page, the Test Report, CSV export, benchmarks,
-- best-trial scoring) works with zero changes.
--
-- on delete set null on the child FK: deleting the group wrapper
-- leaves every athlete's individual session and data fully intact,
-- just un-grouped.
-- ============================================================

create table group_test_sessions (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name            text not null default '',
  test_battery_id uuid references test_batteries(id) on delete set null,
  date            date not null,
  created_at      timestamptz not null default now()
);

create index group_test_sessions_org_idx on group_test_sessions(organisation_id);

alter table test_sessions
  add column if not exists group_test_session_id uuid
    references group_test_sessions(id) on delete set null;

create index test_sessions_group_idx on test_sessions(group_test_session_id);

alter table group_test_sessions enable row level security;

create policy "Coaches manage own org group test sessions" on group_test_sessions
  for all using (organisation_id = my_organisation_id())
  with check (organisation_id = my_organisation_id());

-- ============================================================
-- 0005_testing_system.sql
-- ============================================================
-- New module: the youth athlete physical testing system (currently
-- a standalone Python/ReportLab tool — salopia_final.py — generating
-- PDF reports with dual RAG benchmarking against elite youth and
-- general population norms). This brings that data model into the
-- main database so test results live alongside programme data for
-- the same athlete, rather than in a separate, disconnected tool.
--
-- Key design decisions, carried over from the proven Python tool:
-- - Best trial is used for scoring, not the average across trials -
--   so each individual trial is stored, and "best" is computed at
--   read time (the metric defines whether higher or lower is better).
-- - Some metrics (IMTP) need the athlete's bodyweight to compute a
--   relative score (N/kg) - bodyweight is captured per test SESSION
--   (a single visit), not per individual metric, since it doesn't
--   change between tests done on the same day.
-- - Benchmarks are dual: elite youth AND general population norms,
--   and benchmarks vary by metric, and often by sex and age band.
-- ============================================================

-- ------------------------------------------------------------
-- TEST BATTERIES
-- A named, reusable collection of test metrics a coach runs as one
-- testing session - e.g. "Standard Youth S&C Battery" containing
-- 10m Sprint, CMJ, RSI, IMTP, 5-0-5, Anterior Hold, Side Plank, etc.
-- ------------------------------------------------------------
create table test_batteries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  description text default '',
  created_at timestamptz not null default now()
);

create index test_batteries_organisation_id_idx on test_batteries(organisation_id);

-- ------------------------------------------------------------
-- TEST METRICS
-- The definition of a single measurable test - e.g. "10m Sprint",
-- "CMJ Height", "IMTP Peak Force", "5-0-5 Left", "Grip Strength".
-- These are organisation-level definitions (so a coach can build
-- their own metric library), optionally linked to a battery via
-- test_battery_metrics below.
-- ------------------------------------------------------------
create table test_metrics (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  unit text not null default '', -- e.g. 's', 'cm', 'N', 'N/kg', 'kg'
  -- Whether a lower or higher raw value is the better result - e.g.
  -- sprint time: lower is better; jump height: higher is better.
  -- Used when computing "best trial" from a set of trials.
  better_direction text not null default 'higher' check (better_direction in ('higher', 'lower')),
  -- Whether this metric needs the athlete's bodyweight to compute a
  -- relative score (e.g. IMTP N/kg). If true, the UI should prompt
  -- for bodyweight on the test session before this metric is scored.
  requires_bodyweight boolean not null default false,
  -- Whether this metric is captured per side (e.g. 5-0-5 Left/Right,
  -- SL CMJ) - if true, results are recorded separately per side and
  -- an asymmetry percentage can be derived between them.
  is_bilateral boolean not null default false,
  notes text default '',
  created_at timestamptz not null default now()
);

create index test_metrics_organisation_id_idx on test_metrics(organisation_id);

create table test_battery_metrics (
  test_battery_id uuid not null references test_batteries(id) on delete cascade,
  test_metric_id uuid not null references test_metrics(id) on delete cascade,
  sort_order int not null default 0,
  primary key (test_battery_id, test_metric_id)
);

-- ------------------------------------------------------------
-- BENCHMARKS
-- Dual RAG (red/amber/green) reference values per metric, used to
-- colour-code a result against either elite youth or general
-- population norms. Benchmarks can be narrowed by sex and/or an age
-- band (age_min/age_max in years) - a null sex or null age bounds
-- means "applies to everyone" for that field.
-- ------------------------------------------------------------
create table test_benchmarks (
  id uuid primary key default gen_random_uuid(),
  test_metric_id uuid not null references test_metrics(id) on delete cascade,
  benchmark_type text not null check (benchmark_type in ('elite_youth', 'general_population')),
  sex text check (sex in ('male', 'female')), -- null = applies to both
  age_min numeric, -- null = no lower bound
  age_max numeric, -- null = no upper bound
  -- RAG thresholds: a result at or beyond `green_threshold` (in the
  -- metric's better_direction) is green, at/beyond `amber_threshold`
  -- is amber, otherwise red. E.g. for a sprint time (lower=better):
  -- green_threshold=1.8s, amber_threshold=2.0s means <=1.8 is green,
  -- <=2.0 is amber, >2.0 is red.
  green_threshold numeric not null,
  amber_threshold numeric not null,
  created_at timestamptz not null default now()
);

create index test_benchmarks_test_metric_id_idx on test_benchmarks(test_metric_id);

-- ------------------------------------------------------------
-- TEST SESSIONS
-- One row per testing visit for one athlete - e.g. "Jake's testing
-- session, 12 June 2026". Bodyweight is captured here (once per
-- visit) since it's needed by some metrics (see requires_bodyweight
-- above) and doesn't change within a single session.
-- ------------------------------------------------------------
create table test_sessions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  test_battery_id uuid references test_batteries(id) on delete set null,
  date date not null,
  bodyweight_kg numeric, -- null if not recorded yet - IMTP etc. should
                          -- be flagged as a limitation in reports until set
  notes text default '',
  created_at timestamptz not null default now()
);

create index test_sessions_athlete_id_idx on test_sessions(athlete_id);
create index test_sessions_athlete_date_idx on test_sessions(athlete_id, date);

-- ------------------------------------------------------------
-- TEST RESULTS
-- One row per TRIAL (not per metric) - if an athlete does 3 CMJ
-- jumps, that's 3 rows. "Best trial" is computed at read time using
-- the metric's better_direction, matching the proven Python tool's
-- approach of using best-trial rather than averaging.
-- ------------------------------------------------------------
create table test_results (
  id uuid primary key default gen_random_uuid(),
  test_session_id uuid not null references test_sessions(id) on delete cascade,
  test_metric_id uuid not null references test_metrics(id) on delete cascade,
  -- Which side this trial is for, only meaningful when the metric's
  -- is_bilateral is true. null for non-bilateral metrics.
  side text check (side in ('left', 'right')),
  trial_number int not null default 1,
  value numeric not null,
  created_at timestamptz not null default now()
);

create index test_results_test_session_id_idx on test_results(test_session_id);
create index test_results_test_metric_id_idx on test_results(test_metric_id);

-- ------------------------------------------------------------
-- REPORTS
-- A generated report is a point-in-time snapshot reference - the
-- actual PDF/report content is generated on demand from test_results
-- (same approach as the existing Reports feature in the programme
-- builder), but we keep a lightweight record of when a report was
-- generated and for what date range, useful for an athlete-facing
-- "your reports" history view later.
-- ------------------------------------------------------------
create table reports (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  report_type text not null default 'testing' check (report_type in ('testing', 'training_load')),
  range_start date,
  range_end date,
  generated_at timestamptz not null default now()
);

create index reports_athlete_id_idx on reports(athlete_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table test_batteries enable row level security;
alter table test_metrics enable row level security;
alter table test_battery_metrics enable row level security;
alter table test_benchmarks enable row level security;
alter table test_sessions enable row level security;
alter table test_results enable row level security;
alter table reports enable row level security;

create policy "Coaches manage own org test batteries" on test_batteries
  for all using (organisation_id = my_organisation_id())
  with check (organisation_id = my_organisation_id());

create policy "Coaches manage own org test metrics" on test_metrics
  for all using (organisation_id = my_organisation_id())
  with check (organisation_id = my_organisation_id());

create policy "Coaches manage own org battery metrics" on test_battery_metrics
  for all using (
    exists (select 1 from test_batteries b where b.id = test_battery_metrics.test_battery_id and b.organisation_id = my_organisation_id())
  ) with check (
    exists (select 1 from test_batteries b where b.id = test_battery_metrics.test_battery_id and b.organisation_id = my_organisation_id())
  );

create policy "Coaches manage own org benchmarks" on test_benchmarks
  for all using (
    exists (select 1 from test_metrics m where m.id = test_benchmarks.test_metric_id and m.organisation_id = my_organisation_id())
  ) with check (
    exists (select 1 from test_metrics m where m.id = test_benchmarks.test_metric_id and m.organisation_id = my_organisation_id())
  );

create policy "Coaches manage own org test sessions" on test_sessions
  for all using (
    exists (select 1 from athletes a where a.id = test_sessions.athlete_id and a.organisation_id = my_organisation_id())
  ) with check (
    exists (select 1 from athletes a where a.id = test_sessions.athlete_id and a.organisation_id = my_organisation_id())
  );

create policy "Coaches manage own org test results" on test_results
  for all using (
    exists (
      select 1 from test_sessions ts
      join athletes a on a.id = ts.athlete_id
      where ts.id = test_results.test_session_id and a.organisation_id = my_organisation_id()
    )
  ) with check (
    exists (
      select 1 from test_sessions ts
      join athletes a on a.id = ts.athlete_id
      where ts.id = test_results.test_session_id and a.organisation_id = my_organisation_id()
    )
  );

create policy "Coaches manage own org reports" on reports
  for all using (
    exists (select 1 from athletes a where a.id = reports.athlete_id and a.organisation_id = my_organisation_id())
  ) with check (
    exists (select 1 from athletes a where a.id = reports.athlete_id and a.organisation_id = my_organisation_id())
  );

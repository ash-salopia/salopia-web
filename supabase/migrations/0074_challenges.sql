-- ============================================================
-- 0074_challenges.sql
-- ============================================================
-- "Challenges" feature - coach-created gym challenges (e.g. "furthest on
-- the SkiErg in 30 seconds"), saved/reusable or one-off, athletes log a
-- result. Squad-scoped leaderboards are computed at view time by joining
-- through group_members for whichever group is selected (0010) - no
-- group_id is stored on a result, since group membership is many-to-many
-- and can change after the fact; ranking always reflects current
-- membership, same as Squad Reporting already does.
--
-- equipment/metric_key/direction reuse the exact vocabulary already built
-- for Hyrox/Cardio (lib/cardio-metrics.ts's EquipmentType/MetricKey) -
-- metric_key is what's ranked; duration_cap_seconds is just an optional
-- task description (e.g. "30 seconds"), not itself a ranked value.
-- ============================================================

create table challenges (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  created_by uuid not null references coaches(id) on delete cascade,
  name text not null,
  equipment text,
  metric_key text not null,
  duration_cap_seconds integer,
  direction text not null default 'higher' check (direction in ('higher', 'lower')),
  is_saved boolean not null default true,
  created_at timestamptz not null default now()
);

create index challenges_org_idx on challenges(organisation_id);

create table challenge_results (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  athlete_id uuid not null references athletes(id) on delete cascade,
  organisation_id uuid not null references organisations(id) on delete cascade,
  value numeric not null,
  logged_by text not null default 'athlete' check (logged_by in ('athlete', 'coach')),
  logged_at timestamptz not null default now()
);

create index challenge_results_challenge_idx on challenge_results(challenge_id);
create index challenge_results_athlete_idx on challenge_results(athlete_id);

alter table challenges enable row level security;
alter table challenge_results enable row level security;

create policy "Coaches manage own org challenges" on challenges
  for all using (organisation_id = my_organisation_id())
  with check (organisation_id = my_organisation_id());

create policy "Coaches manage own org challenge results" on challenge_results
  for all using (organisation_id = my_organisation_id())
  with check (organisation_id = my_organisation_id());

-- Athletes have no Supabase Auth session - all athlete access goes
-- through service-role athlete-link routes, same as personal_bests etc.
-- No athlete-facing RLS policy needed on either table.

-- Per-athlete override of the org-level challenges_enabled setting
-- (lib/data/settings.ts), same two-level toggle pattern as hyrox_enabled
-- (0025) and pb_enabled (0073).
alter table athletes
  add column if not exists challenges_enabled boolean not null default true;

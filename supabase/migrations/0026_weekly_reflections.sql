-- ============================================================
-- 0026_weekly_reflections.sql
-- Weekly athlete reflections (1-5 scores + Good/Better/How)
-- Plus last_report_date on athletes for report-due tracking
-- ============================================================

alter table athletes
  add column if not exists last_report_date date;

create table weekly_reflections (
  id              uuid primary key default gen_random_uuid(),
  athlete_id      uuid not null references athletes(id) on delete cascade,
  organisation_id uuid not null references organisations(id) on delete cascade,
  week_start      date not null,
  scores          jsonb not null default '{}',
  good            text not null default '',
  better          text not null default '',
  how             text not null default '',
  created_at      timestamptz not null default now(),
  unique(athlete_id, week_start)
);

create index weekly_reflections_athlete_idx on weekly_reflections(athlete_id);
create index weekly_reflections_org_idx     on weekly_reflections(organisation_id);
create index weekly_reflections_week_idx    on weekly_reflections(week_start desc);

alter table weekly_reflections enable row level security;

create policy "Coaches view org reflections" on weekly_reflections
  for all using (organisation_id = my_organisation_id())
  with check (organisation_id = my_organisation_id());

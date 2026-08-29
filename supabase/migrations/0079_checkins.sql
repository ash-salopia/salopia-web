-- Daily athlete readiness check-ins (energy/sleep/soreness/volume),
-- one row per athlete per day. Backs the "Lock programme until
-- check-in completed" org setting (lib/data/settings.ts).
create table checkins (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  date date not null,
  energy smallint not null,
  sleep smallint not null,
  soreness smallint not null,
  volume smallint not null,
  created_at timestamptz not null default now(),
  unique (athlete_id, date)
);

create index idx_checkins_athlete on checkins(athlete_id);

alter table checkins enable row level security;

create policy "Coaches manage own org checkins" on checkins for all
  using (exists (select 1 from athletes a where a.id = checkins.athlete_id and a.organisation_id = my_organisation_id()))
  with check (exists (select 1 from athletes a where a.id = checkins.athlete_id and a.organisation_id = my_organisation_id()));

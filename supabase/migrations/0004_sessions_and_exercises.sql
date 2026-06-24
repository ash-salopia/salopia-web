-- ============================================================
-- 0004_sessions_and_exercises.sql
-- ============================================================
-- Sessions and exercises don't carry their own organisation_id —
-- they reach it via athlete_id -> athletes.organisation_id. This
-- avoids duplicating organisation_id on every table and keeps a
-- single source of truth for "which org does this athlete belong to".
-- ============================================================

-- ------------------------------------------------------------
-- SESSIONS (the real, dated sessions on an athlete's calendar)
-- ------------------------------------------------------------
create table sessions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  name text not null default 'Session',
  date date not null,
  type text not null default 'strength' check (type in ('strength','hyrox','cardio')),
  hyrox_type text,
  hyrox_config jsonb,
  cardio_type text,
  cardio_config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sessions_athlete_id_idx on sessions(athlete_id);
create index sessions_athlete_date_idx on sessions(athlete_id, date);

-- ------------------------------------------------------------
-- EXERCISES (one row per exercise within a session)
-- ------------------------------------------------------------
create table session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  name text not null default '',
  "order" text default '',
  sets int default 3,
  reps text default '',
  time text default '',
  rest text default '',
  target_load text default '',
  tempo text default '2-0-2',
  each_side boolean not null default false,
  notes text default '',
  session_notes text default '',
  video_url text default '',
  progress text default '', -- '', 'yes', 'no' - athlete's self-reported progress check
  progress_reminder boolean not null default false,
  sort_order int not null default 0,
  -- Per-set logged data: [{weight, reps, done}, ...]. Kept as JSONB rather
  -- than its own table since sets are always read/written together as a
  -- unit, never queried individually - same reasoning as hyrox_config.
  log jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index session_exercises_session_id_idx on session_exercises(session_id);
-- Case-insensitive name lookup, used by "apply to future sessions"
create index session_exercises_name_lower_idx on session_exercises (lower(name));

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table sessions enable row level security;
alter table session_exercises enable row level security;

create policy "Coaches manage own org athlete sessions" on sessions
  for all using (
    exists (select 1 from athletes a where a.id = sessions.athlete_id and a.organisation_id = my_organisation_id())
  ) with check (
    exists (select 1 from athletes a where a.id = sessions.athlete_id and a.organisation_id = my_organisation_id())
  );

create policy "Coaches manage own org session exercises" on session_exercises
  for all using (
    exists (
      select 1 from sessions s
      join athletes a on a.id = s.athlete_id
      where s.id = session_exercises.session_id and a.organisation_id = my_organisation_id()
    )
  ) with check (
    exists (
      select 1 from sessions s
      join athletes a on a.id = s.athlete_id
      where s.id = session_exercises.session_id and a.organisation_id = my_organisation_id()
    )
  );

-- ============================================================
-- updated_at trigger for sessions (handy for "last modified" sorting)
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger sessions_set_updated_at
  before update on sessions
  for each row execute function set_updated_at();

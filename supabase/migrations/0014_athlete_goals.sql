-- ============================================================
-- 0014_athlete_goals.sql
-- ============================================================
-- Goal setting for athletes. Goals can be created by either the
-- coach or the athlete themselves.
--
-- goal_type options:
--   'exercise' — linked to an exercise + rep count. Progress is
--                calculated automatically from session logs.
--   'weight'   — standalone weight target (e.g. body weight 80kg)
--   'time'     — time-based target (e.g. 5k in 20:00)
--   'text'     — free text goal, no numeric target
-- ============================================================

create table athlete_goals (
  id            uuid primary key default gen_random_uuid(),
  athlete_id    uuid not null references athletes(id) on delete cascade,

  -- What the goal is called
  label         text not null,

  -- Type determines which fields are used
  goal_type     text not null default 'text'
                  check (goal_type in ('exercise', 'weight', 'time', 'text')),

  -- Exercise goals only
  exercise_name text,
  rep_max       integer,   -- 1 = 1RM, 8 = 8RM, etc.

  -- Numeric target (kg) — used for exercise and weight goals
  target_kg     numeric,

  -- Time target — stored as HH:MM:SS or MM:SS string
  target_time   text not null default '',

  -- Free text target description — used for text goals and extra context
  target_text   text not null default '',

  -- Optional unit label for display (overrides default)
  unit          text not null default '',

  -- Starred = most important, shown prominently
  starred       boolean not null default false,

  -- Extra notes
  notes         text not null default '',

  -- Who created this goal
  created_by    text not null default 'coach'
                  check (created_by in ('coach', 'athlete')),

  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create index athlete_goals_athlete_id_idx on athlete_goals(athlete_id);
create index athlete_goals_starred_idx    on athlete_goals(athlete_id, starred);

alter table athlete_goals enable row level security;

-- Coaches can manage goals for athletes in their org
create policy "Coaches manage athlete goals" on athlete_goals
  for all using (
    exists (
      select 1 from athletes a
      where a.id = athlete_goals.athlete_id
        and a.organisation_id = my_organisation_id()
    )
  )
  with check (
    exists (
      select 1 from athletes a
      where a.id = athlete_goals.athlete_id
        and a.organisation_id = my_organisation_id()
    )
  );

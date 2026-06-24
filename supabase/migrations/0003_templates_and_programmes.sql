-- ============================================================
-- 0003_templates_and_programmes.sql
-- ============================================================

-- ------------------------------------------------------------
-- SESSION TEMPLATES (the "Template Library")
-- ------------------------------------------------------------
create table templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null default 'New template',
  created_at timestamptz not null default now()
);

create index templates_organisation_id_idx on templates(organisation_id);

create table template_defs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates(id) on delete cascade,
  name text not null default 'Session 1',
  type text not null default 'strength' check (type in ('strength','hyrox','cardio')),
  -- Day-of-week numbers (0=Sun..6=Sat) this def repeats on when loaded
  days int[] not null default '{}',
  -- Prescribed exercises for this template def. Stored as JSONB rather than
  -- a separate table since these are prescription-only (no per-set logs or
  -- progress tracking, unlike session_exercises in migration 0004) and are
  -- always read/written as a whole list — same reasoning as
  -- programme_sessions.exercises below.
  exercises jsonb not null default '[]',
  hyrox_type text,
  hyrox_config jsonb,
  cardio_type text,
  cardio_config jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index template_defs_template_id_idx on template_defs(template_id);

-- ------------------------------------------------------------
-- PROGRAMME LIBRARY (bundles of template sessions, assignable
-- to athletes as a labelled package)
-- ------------------------------------------------------------
create table programmes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null default 'New Programme',
  description text default '',
  created_at timestamptz not null default now()
);

create index programmes_organisation_id_idx on programmes(organisation_id);

create table programme_sessions (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references programmes(id) on delete cascade,
  name text not null,
  type text not null default 'strength' check (type in ('strength','hyrox','cardio')),
  exercises jsonb not null default '[]', -- snapshot of exercises at save time
  hyrox_type text,
  hyrox_config jsonb,
  cardio_type text,
  cardio_config jsonb,
  sort_order int not null default 0
);

create index programme_sessions_programme_id_idx on programme_sessions(programme_id);

create table programme_assignments (
  programme_id uuid not null references programmes(id) on delete cascade,
  athlete_id uuid not null references athletes(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (programme_id, athlete_id)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table templates enable row level security;
alter table template_defs enable row level security;
alter table programmes enable row level security;
alter table programme_sessions enable row level security;
alter table programme_assignments enable row level security;

create policy "Coaches manage own org templates" on templates
  for all using (organisation_id = my_organisation_id())
  with check (organisation_id = my_organisation_id());

create policy "Coaches manage own org template defs" on template_defs
  for all using (
    exists (select 1 from templates t where t.id = template_defs.template_id and t.organisation_id = my_organisation_id())
  ) with check (
    exists (select 1 from templates t where t.id = template_defs.template_id and t.organisation_id = my_organisation_id())
  );

create policy "Coaches manage own org programmes" on programmes
  for all using (organisation_id = my_organisation_id())
  with check (organisation_id = my_organisation_id());

create policy "Coaches manage own org programme sessions" on programme_sessions
  for all using (
    exists (select 1 from programmes p where p.id = programme_sessions.programme_id and p.organisation_id = my_organisation_id())
  ) with check (
    exists (select 1 from programmes p where p.id = programme_sessions.programme_id and p.organisation_id = my_organisation_id())
  );

create policy "Coaches manage own org programme assignments" on programme_assignments
  for all using (
    exists (select 1 from programmes p where p.id = programme_assignments.programme_id and p.organisation_id = my_organisation_id())
  ) with check (
    exists (select 1 from programmes p where p.id = programme_assignments.programme_id and p.organisation_id = my_organisation_id())
  );

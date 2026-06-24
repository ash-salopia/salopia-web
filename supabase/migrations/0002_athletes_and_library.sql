-- ============================================================
-- 0002_athletes_and_library.sql
-- ============================================================
-- Athletes and the exercise library belong to the ORGANISATION, not
-- an individual coach — so if a second coach joins later, they see
-- the same athlete roster and library automatically, rather than
-- needing data to be re-entered or explicitly shared.
-- ============================================================

-- ------------------------------------------------------------
-- ATHLETES
-- ------------------------------------------------------------
create table athletes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  "group" text default '',
  -- Private, unguessable token used to build each athlete's view-only
  -- link (e.g. /a/<share_token>). Regenerate this to revoke an old link.
  share_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create index athletes_organisation_id_idx on athletes(organisation_id);
create unique index athletes_share_token_idx on athletes(share_token);

-- ------------------------------------------------------------
-- EXERCISE LIBRARY
-- ------------------------------------------------------------
create table library_entries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  -- e.g. ['strength'], ['hyrox'], ['strength','hyrox'] for crossover moves
  types text[] not null default '{}',
  video_url text default '',
  sets text default '',
  reps text default '',
  time text default '',
  rest text default '',
  target_load text default '',
  tempo text default '2-0-2',
  notes text default '',
  created_at timestamptz not null default now()
);

create index library_entries_organisation_id_idx on library_entries(organisation_id);
-- Case-insensitive name lookup, used heavily for CSV import linking
create index library_entries_name_lower_idx on library_entries (organisation_id, lower(name));

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table athletes enable row level security;
alter table library_entries enable row level security;

create policy "Coaches manage own org athletes" on athletes
  for all using (organisation_id = my_organisation_id())
  with check (organisation_id = my_organisation_id());

create policy "Coaches manage own org library" on library_entries
  for all using (organisation_id = my_organisation_id())
  with check (organisation_id = my_organisation_id());

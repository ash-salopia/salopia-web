-- ============================================================
-- 0025_competitions.sql
-- Competition calendar — athletes add their upcoming events,
-- org-mates react and comment for motivation.
-- ============================================================

create table competitions (
  id               uuid primary key default gen_random_uuid(),
  athlete_id       uuid not null references athletes(id) on delete cascade,
  organisation_id  uuid not null references organisations(id) on delete cascade,
  title            text not null,
  competition_date date not null,
  location         text,
  notes            text,
  created_at       timestamptz not null default now()
);

create index competitions_org_idx     on competitions(organisation_id);
create index competitions_athlete_idx on competitions(athlete_id);
create index competitions_date_idx    on competitions(competition_date);

create table competition_reactions (
  id            uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  reactor_id    uuid not null,
  reactor_type  text not null check (reactor_type in ('athlete', 'coach')),
  reactor_name  text not null default '',
  emoji         text not null,
  created_at    timestamptz not null default now(),
  unique(competition_id, reactor_id, reactor_type)
);

create index competition_reactions_comp_idx on competition_reactions(competition_id);

create table competition_comments (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  author_id      uuid not null,
  author_type    text not null check (author_type in ('athlete', 'coach')),
  author_name    text not null default '',
  body           text not null,
  created_at     timestamptz not null default now()
);

create index competition_comments_comp_idx on competition_comments(competition_id);

alter table competitions          enable row level security;
alter table competition_reactions enable row level security;
alter table competition_comments  enable row level security;

create policy "Org members manage competitions" on competitions
  for all using (organisation_id = my_organisation_id())
  with check (organisation_id = my_organisation_id());

create policy "Org members manage competition reactions" on competition_reactions
  for all using (
    exists (
      select 1 from competitions c
      where c.id = competition_reactions.competition_id
        and c.organisation_id = my_organisation_id()
    )
  );

create policy "Org members manage competition comments" on competition_comments
  for all using (
    exists (
      select 1 from competitions c
      where c.id = competition_comments.competition_id
        and c.organisation_id = my_organisation_id()
    )
  );

-- Also add per-athlete hyrox_enabled override
alter table athletes
  add column if not exists hyrox_enabled boolean not null default true;

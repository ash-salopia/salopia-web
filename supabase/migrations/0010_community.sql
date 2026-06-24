-- ============================================================
-- 0010_community.sql
-- ============================================================
-- Community features: groups, announcements, personal bests,
-- and optional athlete auth accounts for reactions/posting.
--
-- Design decisions:
--   • Groups belong to organisations, not individual coaches
--   • Announcements can target a specific group OR all athletes (group_id null)
--   • personal_bests keeps full history — one row per PB event,
--     not just the current record — so the feed shows "when it happened"
--   • athlete_accounts is optional: athletes can use the app read-only
--     via their share token forever; creating an account unlocks reactions
-- ============================================================

-- ── Groups ────────────────────────────────────────────────────────────────────

create table groups (
  id           uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name         text not null,
  description  text not null default '',
  colour       text not null default '#4a9eff',
  created_at   timestamptz not null default now()
);

create index groups_organisation_id_idx on groups(organisation_id);

-- ── Group members (athletes ↔ groups, many-to-many) ──────────────────────────

create table group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups(id) on delete cascade,
  athlete_id uuid not null references athletes(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  unique(group_id, athlete_id)
);

create index group_members_group_id_idx   on group_members(group_id);
create index group_members_athlete_id_idx on group_members(athlete_id);

-- ── Optional athlete auth accounts ───────────────────────────────────────────
-- Linking a Supabase Auth user to an existing athlete row.
-- Coaches create athletes; athletes optionally sign up later.

create table athlete_accounts (
  id         uuid primary key references auth.users(id) on delete cascade,
  athlete_id uuid not null references athletes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(athlete_id)
);

-- ── Announcements ─────────────────────────────────────────────────────────────

create table announcements (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  coach_id        uuid not null references coaches(id) on delete cascade,
  group_id        uuid references groups(id) on delete cascade, -- null = all athletes
  title           text not null,
  body            text not null default '',
  pinned          boolean not null default false,
  created_at      timestamptz not null default now()
);

create index announcements_organisation_id_idx on announcements(organisation_id);
create index announcements_group_id_idx        on announcements(group_id);

-- ── Personal bests ────────────────────────────────────────────────────────────
-- One row per PB event (history kept, not upserted) so the feed
-- can show "Sarah hit a squat PB today" rather than just the current max.

create table personal_bests (
  id            uuid primary key default gen_random_uuid(),
  athlete_id    uuid not null references athletes(id) on delete cascade,
  exercise_name text not null,
  weight_kg     numeric,   -- null for bodyweight/time-based exercises
  reps          integer,
  date          date not null,
  session_id    uuid references sessions(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index personal_bests_athlete_id_idx      on personal_bests(athlete_id);
create index personal_bests_exercise_lower_idx  on personal_bests(athlete_id, lower(exercise_name));
create index personal_bests_date_idx            on personal_bests(date desc);

-- ── PB reactions (emoji responses from coaches and athletes) ─────────────────

create table pb_reactions (
  id            uuid primary key default gen_random_uuid(),
  pb_id         uuid not null references personal_bests(id) on delete cascade,
  reactor_type  text not null check (reactor_type in ('coach', 'athlete')),
  reactor_id    uuid not null,
  reactor_name  text not null default '',
  emoji         text not null default '🔥',
  created_at    timestamptz not null default now(),
  unique(pb_id, reactor_type, reactor_id)
);

create index pb_reactions_pb_id_idx on pb_reactions(pb_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table groups           enable row level security;
alter table group_members    enable row level security;
alter table athlete_accounts enable row level security;
alter table announcements    enable row level security;
alter table personal_bests   enable row level security;
alter table pb_reactions     enable row level security;

-- Groups: coaches manage their org's groups
create policy "Coaches manage own org groups" on groups
  for all using (organisation_id = my_organisation_id())
  with check (organisation_id = my_organisation_id());

-- Group members: coaches manage for groups in their org
create policy "Coaches manage group members" on group_members
  for all using (
    exists (
      select 1 from groups g
      where g.id = group_members.group_id
        and g.organisation_id = my_organisation_id()
    )
  );

-- Athlete accounts: coaches can read for their org's athletes
create policy "Coaches view athlete accounts" on athlete_accounts
  for select using (
    exists (
      select 1 from athletes a
      where a.id = athlete_accounts.athlete_id
        and a.organisation_id = my_organisation_id()
    )
  );

-- Athlete accounts: athletes manage their own row
create policy "Athletes manage own account" on athlete_accounts
  for all using (id = auth.uid())
  with check (id = auth.uid());

-- Announcements: coaches manage their org's announcements
create policy "Coaches manage announcements" on announcements
  for all using (organisation_id = my_organisation_id())
  with check (organisation_id = my_organisation_id());

-- Personal bests: coaches can manage PBs for their org's athletes
create policy "Coaches manage org personal bests" on personal_bests
  for all using (
    exists (
      select 1 from athletes a
      where a.id = personal_bests.athlete_id
        and a.organisation_id = my_organisation_id()
    )
  );

-- PB reactions: coaches manage reactions for their org's PBs
create policy "Coaches manage pb reactions" on pb_reactions
  for all using (
    exists (
      select 1 from personal_bests pb
      join athletes a on a.id = pb.athlete_id
      where pb.id = pb_reactions.pb_id
        and a.organisation_id = my_organisation_id()
    )
  );

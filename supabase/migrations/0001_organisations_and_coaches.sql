-- ============================================================
-- 0001_organisations_and_coaches.sql
-- ============================================================
-- Foundation: organisations sit above individual coaches, so the
-- schema supports more than one coach sharing a business (a second
-- coach, a business partner, staff) without restructuring later.
-- A solo coach today is simply an organisation of one.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- ORGANISATIONS
-- ------------------------------------------------------------
create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- COACHES
-- One row per coach, linked 1:1 to a Supabase Auth user, belonging
-- to exactly one organisation. The first coach to sign up for an
-- organisation is its owner; additional coaches can be invited later
-- (invite flow is a future migration, not built yet).
-- ------------------------------------------------------------
create table coaches (
  id uuid primary key references auth.users(id) on delete cascade,
  organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null default '',
  role text not null default 'owner' check (role in ('owner', 'coach')),
  created_at timestamptz not null default now()
);

create index coaches_organisation_id_idx on coaches(organisation_id);

-- ------------------------------------------------------------
-- Helper function: the calling user's organisation_id, used
-- throughout RLS policies in later migrations so every policy reads
-- "does this row belong to MY organisation" rather than repeating
-- the same subquery everywhere.
-- ------------------------------------------------------------
create or replace function my_organisation_id()
returns uuid
language sql
security definer
stable
as $$
  select organisation_id from coaches where id = auth.uid()
$$;

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table organisations enable row level security;
alter table coaches enable row level security;

-- A coach can see/update their own organisation
create policy "Coaches view own organisation" on organisations
  for select using (id = my_organisation_id());

create policy "Coaches update own organisation" on organisations
  for update using (id = my_organisation_id());

-- A coach can see other coaches in the same organisation, but can
-- only update their own row (not impersonate or edit a colleague).
create policy "Coaches view colleagues in same org" on coaches
  for select using (organisation_id = my_organisation_id());

create policy "Coaches update own row" on coaches
  for update using (id = auth.uid());

-- Inserting a coach row happens via a server-side signup flow (not
-- built yet) using the service role key, bypassing RLS entirely —
-- so no insert policy is defined here deliberately. A coach should
-- never be able to insert their own row directly from the client,
-- since that would let anyone assign themselves to any organisation.

-- ============================================================
-- 0068_feature_requests.sql
-- ============================================================
-- A "Request a Feature" board (like TeamBuildr's public UserJot
-- board) — coaches post requests, upvote, and comment. Deliberately
-- GLOBAL across every organisation rather than org-scoped: this is
-- feedback about the product itself, not athlete/coaching data, so
-- every coach on the platform sees and votes on the same shared
-- list. Every other table in this schema is isolated by
-- my_organisation_id() — this is the one intentional exception, so
-- policies here check coach identity only, never organisation_id.
--
-- is_app_admin is a new, separate concept from coaches.role (which
-- is org-scoped owner/coach) — it marks a platform-level admin (i.e.
-- VIS BUILD staff) who can move a request's status along, regardless
-- of which organisation they belong to. Defaults false for everyone;
-- flip it on manually for your own coach row after this runs.
-- ============================================================

alter table coaches add column if not exists is_app_admin boolean not null default false;
comment on column coaches.is_app_admin is 'Platform-level admin (VIS BUILD staff), independent of the org-scoped owner/coach role — can update feature_requests.status. Set manually.';

create or replace function is_platform_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce((select is_app_admin from coaches where id = auth.uid()), false)
$$;

-- ------------------------------------------------------------
-- Active-coach check, the "any org" equivalent of
-- coach_can_access_athlete()'s org-scoped check elsewhere.
-- ------------------------------------------------------------
create or replace function is_active_coach()
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from coaches where id = auth.uid() and archived = false)
$$;

create table feature_requests (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coaches(id) on delete cascade,
  title text not null,
  description text not null default '',
  category text not null default 'general'
    check (category in ('general', 'programming', 'testing', 'reporting', 'athlete_app', 'other')),
  status text not null default 'open'
    check (status in ('open', 'planned', 'in_progress', 'done', 'closed')),
  created_at timestamptz not null default now()
);

create index feature_requests_created_at_idx on feature_requests(created_at desc);

create table feature_request_votes (
  request_id uuid not null references feature_requests(id) on delete cascade,
  coach_id uuid not null references coaches(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, coach_id)
);

create table feature_request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references feature_requests(id) on delete cascade,
  coach_id uuid not null references coaches(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index feature_request_comments_request_id_idx on feature_request_comments(request_id);

alter table feature_requests enable row level security;
alter table feature_request_votes enable row level security;
alter table feature_request_comments enable row level security;

-- feature_requests: any active coach (any org) can read and post;
-- only the author can delete their own; only a platform admin can
-- change status (author included, since editing your own status
-- would defeat the point of an admin-curated roadmap).
create policy "Any active coach reads requests" on feature_requests
  for select using (is_active_coach());

create policy "Any active coach posts requests" on feature_requests
  for insert with check (coach_id = auth.uid() and is_active_coach());

create policy "Author or admin deletes requests" on feature_requests
  for delete using (coach_id = auth.uid() or is_platform_admin());

create policy "Only admin updates request status" on feature_requests
  for update using (is_platform_admin()) with check (is_platform_admin());

-- feature_request_votes: any active coach votes as themselves, and
-- can remove their own vote (toggle). Read access needed by everyone
-- to compute counts and "you voted" state.
create policy "Any active coach reads votes" on feature_request_votes
  for select using (is_active_coach());

create policy "Any active coach votes as themselves" on feature_request_votes
  for insert with check (coach_id = auth.uid() and is_active_coach());

create policy "Coach removes own vote" on feature_request_votes
  for delete using (coach_id = auth.uid());

-- feature_request_comments: any active coach reads/posts; author or
-- admin can delete (moderation), same pattern as pb_comments.
create policy "Any active coach reads comments" on feature_request_comments
  for select using (is_active_coach());

create policy "Any active coach comments as themselves" on feature_request_comments
  for insert with check (coach_id = auth.uid() and is_active_coach());

create policy "Author or admin deletes comments" on feature_request_comments
  for delete using (coach_id = auth.uid() or is_platform_admin());

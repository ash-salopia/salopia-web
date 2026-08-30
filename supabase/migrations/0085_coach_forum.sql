-- ============================================================
-- 0085_coach_forum.sql
-- ============================================================
-- The Coach Forum — a community discussion space for every coach on
-- the platform, in topic-specific rooms (Programming, Rehab, Testing,
-- Business, Journal Club, Feature Requests, …).
--
-- Like feature_requests (0068) this is DELIBERATELY GLOBAL across
-- every organisation: it's coach-to-coach discussion about the craft
-- and the product, never athlete/coaching data. Policies check coach
-- identity only, never organisation_id — reusing the helpers 0068
-- introduced: is_active_coach(), is_platform_admin(), and (for author
-- names across orgs) the get_coach_public_profiles(uuid[]) RPC (0069).
--
-- "Feature Requests" moves into the forum as one room (kind
-- 'feature_requests'); its existing tables (feature_requests /
-- feature_request_votes / feature_request_comments) are untouched —
-- the forum UI renders that room from those tables, everything else
-- from the forum_* tables below.
-- ============================================================

-- ------------------------------------------------------------
-- ROOMS — admin-managed; every active coach can read.
-- ------------------------------------------------------------
create table forum_rooms (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text not null default '',
  icon        text not null default '💬',
  kind        text not null default 'discussion'
    check (kind in ('discussion', 'journal_club', 'feature_requests')),
  sort_order  int not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- THREADS — one per topic/post. Journal-club threads carry a few
-- extra structured fields (null on ordinary discussion threads).
-- ------------------------------------------------------------
create table forum_threads (
  id               uuid primary key default gen_random_uuid(),
  room_id          uuid not null references forum_rooms(id) on delete cascade,
  coach_id         uuid not null references coaches(id) on delete cascade,
  title            text not null,
  body             text not null default '',
  pinned           boolean not null default false,
  edited_at        timestamptz,
  jc_source_type   text check (jc_source_type in
    ('article', 'chapter', 'conference', 'seminar', 'podcast', 'other')),
  jc_reference     text,   -- citation / DOI / URL
  jc_takeaways     text,   -- key takeaways (body holds the summary)
  created_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create index forum_threads_room_idx on forum_threads(room_id, pinned desc, last_activity_at desc);
create index forum_threads_coach_idx on forum_threads(coach_id);

-- ------------------------------------------------------------
-- REPLIES
-- ------------------------------------------------------------
create table forum_replies (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references forum_threads(id) on delete cascade,
  coach_id   uuid not null references coaches(id) on delete cascade,
  body       text not null,
  edited_at  timestamptz,
  created_at timestamptz not null default now()
);

create index forum_replies_thread_idx on forum_replies(thread_id, created_at);

-- ------------------------------------------------------------
-- THREAD VOTES (upvotes) — powers the "Top" sort.
-- ------------------------------------------------------------
create table forum_thread_votes (
  thread_id  uuid not null references forum_threads(id) on delete cascade,
  coach_id   uuid not null references coaches(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (thread_id, coach_id)
);

-- ------------------------------------------------------------
-- Triggers
-- ------------------------------------------------------------
-- A new reply bumps the thread so it rises in "Active" order.
create or replace function forum_bump_thread_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update forum_threads set last_activity_at = now() where id = new.thread_id;
  return new;
end;
$$;

create trigger forum_replies_bump_activity
  after insert on forum_replies
  for each row execute function forum_bump_thread_activity();

-- Only a platform admin may (un)pin. Authors can still edit their own
-- title/body — this just prevents the `pinned` flag riding along on a
-- non-admin update.
create or replace function forum_guard_pin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pinned is distinct from old.pinned and not is_platform_admin() then
    new.pinned := old.pinned;
  end if;
  return new;
end;
$$;

create trigger forum_threads_guard_pin
  before update on forum_threads
  for each row execute function forum_guard_pin();

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY — mirrors 0068_feature_requests.sql
-- ------------------------------------------------------------
alter table forum_rooms        enable row level security;
alter table forum_threads      enable row level security;
alter table forum_replies      enable row level security;
alter table forum_thread_votes enable row level security;

-- Rooms: everyone reads, only platform admins manage.
create policy "Any active coach reads rooms" on forum_rooms
  for select using (is_active_coach());
create policy "Only admin manages rooms" on forum_rooms
  for all using (is_platform_admin()) with check (is_platform_admin());

-- Threads: everyone reads; any active coach posts as themselves;
-- author or admin edits/deletes.
create policy "Any active coach reads threads" on forum_threads
  for select using (is_active_coach());
create policy "Any active coach posts threads" on forum_threads
  for insert with check (coach_id = auth.uid() and is_active_coach());
create policy "Author or admin edits threads" on forum_threads
  for update using (coach_id = auth.uid() or is_platform_admin())
  with check (coach_id = auth.uid() or is_platform_admin());
create policy "Author or admin deletes threads" on forum_threads
  for delete using (coach_id = auth.uid() or is_platform_admin());

-- Replies: same shape.
create policy "Any active coach reads replies" on forum_replies
  for select using (is_active_coach());
create policy "Any active coach posts replies" on forum_replies
  for insert with check (coach_id = auth.uid() and is_active_coach());
create policy "Author or admin edits replies" on forum_replies
  for update using (coach_id = auth.uid() or is_platform_admin())
  with check (coach_id = auth.uid() or is_platform_admin());
create policy "Author or admin deletes replies" on forum_replies
  for delete using (coach_id = auth.uid() or is_platform_admin());

-- Votes: any active coach votes as themselves and can remove it.
create policy "Any active coach reads thread votes" on forum_thread_votes
  for select using (is_active_coach());
create policy "Any active coach votes as themselves" on forum_thread_votes
  for insert with check (coach_id = auth.uid() and is_active_coach());
create policy "Coach removes own thread vote" on forum_thread_votes
  for delete using (coach_id = auth.uid());

-- ------------------------------------------------------------
-- Seed the default rooms (idempotent on slug). Feature Requests is
-- pinned to the top.
-- ------------------------------------------------------------
insert into forum_rooms (slug, name, description, icon, kind, sort_order) values
  ('feature-requests','Feature Requests',     'Suggest and upvote improvements to VIS BUILD.',                            '💡', 'feature_requests', 0),
  ('programming',     'Programming',          'Session design, periodisation, exercise selection, progressions.',        '🏋️', 'discussion',       1),
  ('rehab',           'Rehab & Injury',       'Return-to-play, load management, working around niggles and injuries.',   '🩹', 'discussion',       2),
  ('testing',         'Testing & Assessment', 'Protocols, kit, norms, interpreting results, youth testing.',             '🧪', 'discussion',       3),
  ('psychology',      'Athlete Psychology',   'Motivation, adherence, buy-in, communication, working with youth.',       '🧠', 'discussion',       4),
  ('coaching-skills', 'Coaching Skills',      'Cueing, session delivery, group management, the coaching craft.',          '🎯', 'discussion',       5),
  ('business',        'Business & Pricing',   'Pricing, retention, marketing, contracts, running a coaching business.',   '💼', 'discussion',       6),
  ('journal-club',    'Journal Club',         'Summaries of articles, book chapters, conferences and seminars.',          '📚', 'journal_club',     7),
  ('using-visbuild',  'Using VIS BUILD',      'Tips, workflows and questions about the app itself.',                      '⚙️', 'discussion',       8),
  ('general',         'General',              'Everything else — introductions, off-topic, general chat.',                '💬', 'discussion',       9)
on conflict (slug) do nothing;

-- Fix ordering if this migration is re-run after an earlier version
-- seeded a different sort_order (e.g. Feature Requests at the bottom).
update forum_rooms set sort_order = case slug
  when 'feature-requests' then 0
  when 'programming'      then 1
  when 'rehab'            then 2
  when 'testing'          then 3
  when 'psychology'       then 4
  when 'coaching-skills'  then 5
  when 'business'         then 6
  when 'journal-club'     then 7
  when 'using-visbuild'   then 8
  when 'general'          then 9
  else sort_order end
where slug in ('feature-requests','programming','rehab','testing','psychology',
  'coaching-skills','business','journal-club','using-visbuild','general');

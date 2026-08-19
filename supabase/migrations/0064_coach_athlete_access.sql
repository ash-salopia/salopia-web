-- ============================================================
-- 0064_coach_athlete_access.sql
-- ============================================================
-- Per-coach athlete access restriction. Until now every RLS policy
-- in this schema keyed off my_organisation_id() alone — any coach in
-- an org could see/edit every athlete's data. This adds a second,
-- orthogonal tier: an org owner can mark a coach as 'assigned' access
-- (default stays 'all', so nothing changes for existing teams unless
-- an owner explicitly restricts someone), and assign that coach a
-- specific subset of athletes via the new coach_athletes join table.
--
-- Deliberately NOT touched by this migration (stay fully org-wide for
-- every coach regardless of athlete_access): groups, group_messages,
-- announcements, library_entries, templates, template_defs,
-- programmes, programme_sessions, programme_assignments,
-- test_batteries, test_metrics, test_benchmarks, recovery_presets,
-- report_presets, session_note_templates, push_subscriptions,
-- coaches, organisations. These are shared coaching tools or org-wide
-- communication features, not per-athlete records — restricting them
-- would be a much bigger, separate change or actively unhelpful (a
-- restricted coach still needs the shared exercise library/templates
-- to actually coach their assigned athletes).
-- ============================================================

alter table coaches add column if not exists athlete_access text not null default 'all'
  check (athlete_access in ('all', 'assigned'));
comment on column coaches.athlete_access is
  '''all'' (default) = today''s behaviour, sees every athlete in the org. ''assigned'' = only athletes present in coach_athletes. Owners always get full access regardless of this column — see coach_can_access_athlete() below.';

-- ------------------------------------------------------------
-- COACH <-> ATHLETE ASSIGNMENT (many-to-many)
-- An athlete can be assigned to more than one restricted coach (e.g.
-- head coach + assistant both need access). Populated by the owner
-- via Team settings, and automatically by createAthlete for whichever
-- coach creates a new athlete (see lib/data/athletes.ts) so "can add
-- new athletes" works for a restricted coach without a manual
-- assignment step afterwards.
-- ------------------------------------------------------------
create table coach_athletes (
  coach_id   uuid not null references coaches(id) on delete cascade,
  athlete_id uuid not null references athletes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coach_id, athlete_id)
);

create index coach_athletes_athlete_id_idx on coach_athletes(athlete_id);

alter table coach_athletes enable row level security;

-- Any coach in the org can view assignments (Team settings needs to
-- list who's assigned to whom, and a restricted coach's own client
-- code reads its own assignments too).
create policy "Coaches view own org coach athlete assignments" on coach_athletes
  for select using (
    exists (select 1 from coaches c where c.id = coach_athletes.coach_id and c.organisation_id = my_organisation_id())
  );

-- Only the org owner manages assignments generally, EXCEPT a coach
-- inserting a row that assigns THEMSELVES to an athlete they just
-- created (createAthlete's auto-assign) — hence the coach_id =
-- auth.uid() escape hatch on insert specifically.
create policy "Owners manage coach athlete assignments" on coach_athletes
  for insert with check (
    (coach_id = auth.uid() or my_coach_role() = 'owner')
    and exists (select 1 from coaches c where c.id = coach_athletes.coach_id and c.organisation_id = my_organisation_id())
  );

create policy "Owners delete coach athlete assignments" on coach_athletes
  for delete using (
    my_coach_role() = 'owner'
    and exists (select 1 from coaches c where c.id = coach_athletes.coach_id and c.organisation_id = my_organisation_id())
  );

-- ------------------------------------------------------------
-- THE CHOKE POINT
-- Every in-scope policy below routes through this single function,
-- same architectural pattern as my_organisation_id() itself. Owners
-- always pass regardless of athlete_access, as a DB-level guarantee
-- independent of whatever the UI happens to allow.
-- ------------------------------------------------------------
create or replace function coach_can_access_athlete(target_athlete_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from athletes a
    join coaches c on c.id = auth.uid() and c.archived = false
    where a.id = target_athlete_id
      and a.organisation_id = c.organisation_id
      and (
        c.role = 'owner'
        or c.athlete_access = 'all'
        or exists (select 1 from coach_athletes ca where ca.coach_id = c.id and ca.athlete_id = a.id)
      )
  )
$$;

-- ------------------------------------------------------------
-- ATHLETES
-- Special case: `using` (select/update/delete) is restricted, but
-- `with check` (insert) stays a plain org check — any coach can still
-- create a new athlete in their own org; restriction only narrows
-- what happens after it exists (createAthlete assigns it to the
-- creating coach separately). Routing insert through
-- coach_can_access_athlete would be circular anyway, since that
-- function itself queries athletes.
-- ------------------------------------------------------------
drop policy if exists "Coaches manage own org athletes" on athletes;

create policy "Coaches manage own org athletes" on athletes
  for all using (coach_can_access_athlete(id))
  with check (organisation_id = my_organisation_id());

-- ------------------------------------------------------------
-- SESSIONS / SESSION_EXERCISES
-- ------------------------------------------------------------
drop policy if exists "Coaches manage own org athlete sessions" on sessions;

create policy "Coaches manage own org athlete sessions" on sessions
  for all using (coach_can_access_athlete(athlete_id))
  with check (coach_can_access_athlete(athlete_id));

drop policy if exists "Coaches manage own org session exercises" on session_exercises;

create policy "Coaches manage own org session exercises" on session_exercises
  for all using (
    exists (select 1 from sessions s where s.id = session_exercises.session_id and coach_can_access_athlete(s.athlete_id))
  ) with check (
    exists (select 1 from sessions s where s.id = session_exercises.session_id and coach_can_access_athlete(s.athlete_id))
  );

-- ------------------------------------------------------------
-- TESTING SYSTEM (test_sessions / test_results / reports)
-- test_batteries/test_metrics/test_battery_metrics/test_benchmarks
-- are org-wide definitions, not athlete data, so left untouched.
-- ------------------------------------------------------------
drop policy if exists "Coaches manage own org test sessions" on test_sessions;

create policy "Coaches manage own org test sessions" on test_sessions
  for all using (coach_can_access_athlete(athlete_id))
  with check (coach_can_access_athlete(athlete_id));

drop policy if exists "Coaches manage own org test results" on test_results;

create policy "Coaches manage own org test results" on test_results
  for all using (
    exists (select 1 from test_sessions ts where ts.id = test_results.test_session_id and coach_can_access_athlete(ts.athlete_id))
  ) with check (
    exists (select 1 from test_sessions ts where ts.id = test_results.test_session_id and coach_can_access_athlete(ts.athlete_id))
  );

drop policy if exists "Coaches manage own org reports" on reports;

create policy "Coaches manage own org reports" on reports
  for all using (coach_can_access_athlete(athlete_id))
  with check (coach_can_access_athlete(athlete_id));

-- ------------------------------------------------------------
-- ATHLETE DOCUMENTS / GOALS / ONE-RMS
-- ------------------------------------------------------------
drop policy if exists "Coaches manage org documents" on athlete_documents;

create policy "Coaches manage org documents" on athlete_documents
  for all using (coach_can_access_athlete(athlete_id))
  with check (coach_can_access_athlete(athlete_id));

drop policy if exists "Coaches manage athlete goals" on athlete_goals;

create policy "Coaches manage athlete goals" on athlete_goals
  for all using (coach_can_access_athlete(athlete_id))
  with check (coach_can_access_athlete(athlete_id));

drop policy if exists "Coaches manage own org athlete one-rms" on athlete_one_rms;

create policy "Coaches manage own org athlete one-rms" on athlete_one_rms
  for all using (coach_can_access_athlete(athlete_id))
  with check (coach_can_access_athlete(athlete_id));

-- ------------------------------------------------------------
-- SESSION FEEDBACK / WEEKLY REFLECTIONS
-- ------------------------------------------------------------
drop policy if exists "Coaches manage org session feedback" on session_feedback;

create policy "Coaches manage org session feedback" on session_feedback
  for all using (coach_can_access_athlete(athlete_id))
  with check (coach_can_access_athlete(athlete_id));

drop policy if exists "Coaches view org reflections" on weekly_reflections;

create policy "Coaches view org reflections" on weekly_reflections
  for all using (coach_can_access_athlete(athlete_id))
  with check (coach_can_access_athlete(athlete_id));

-- ------------------------------------------------------------
-- COMPETITIONS
-- ------------------------------------------------------------
drop policy if exists "Org members manage competitions" on competitions;

create policy "Org members manage competitions" on competitions
  for all using (coach_can_access_athlete(athlete_id))
  with check (coach_can_access_athlete(athlete_id));

drop policy if exists "Org members manage competition reactions" on competition_reactions;

create policy "Org members manage competition reactions" on competition_reactions
  for all using (
    exists (select 1 from competitions c where c.id = competition_reactions.competition_id and coach_can_access_athlete(c.athlete_id))
  ) with check (
    exists (select 1 from competitions c where c.id = competition_reactions.competition_id and coach_can_access_athlete(c.athlete_id))
  );

drop policy if exists "Org members manage competition comments" on competition_comments;

create policy "Org members manage competition comments" on competition_comments
  for all using (
    exists (select 1 from competitions c where c.id = competition_comments.competition_id and coach_can_access_athlete(c.athlete_id))
  ) with check (
    exists (select 1 from competitions c where c.id = competition_comments.competition_id and coach_can_access_athlete(c.athlete_id))
  );

-- ------------------------------------------------------------
-- SESSION LIBRARY ACCESS GRANTS
-- ------------------------------------------------------------
drop policy if exists "Coaches manage own org template access grants" on athlete_template_access;

create policy "Coaches manage own org template access grants" on athlete_template_access
  for all using (coach_can_access_athlete(athlete_id))
  with check (coach_can_access_athlete(athlete_id));

-- ------------------------------------------------------------
-- ATHLETE ACCOUNTS
-- Only the coach-facing read policy changes. "Athletes manage own
-- account" (athletes reading/writing their own row via their own
-- auth.uid()) is untouched.
-- ------------------------------------------------------------
drop policy if exists "Coaches view athlete accounts" on athlete_accounts;

create policy "Coaches view athlete accounts" on athlete_accounts
  for select using (coach_can_access_athlete(athlete_id));

-- ------------------------------------------------------------
-- COMMUNITY: PERSONAL BESTS
-- Included deliberately even though it's a "Community" feature — the
-- coach dashboard's Recent PBs widget reads this with no filter of
-- its own, so leaving it org-wide would mean a restricted coach's
-- dashboard still surfaces every athlete's PBs.
-- ------------------------------------------------------------
drop policy if exists "Coaches manage org personal bests" on personal_bests;

create policy "Coaches manage org personal bests" on personal_bests
  for all using (coach_can_access_athlete(athlete_id))
  with check (coach_can_access_athlete(athlete_id));

drop policy if exists "Coaches manage pb reactions" on pb_reactions;

create policy "Coaches manage pb reactions" on pb_reactions
  for all using (
    exists (select 1 from personal_bests pb where pb.id = pb_reactions.pb_id and coach_can_access_athlete(pb.athlete_id))
  ) with check (
    exists (select 1 from personal_bests pb where pb.id = pb_reactions.pb_id and coach_can_access_athlete(pb.athlete_id))
  );

drop policy if exists "Org members read pb comments" on pb_comments;

create policy "Org members read pb comments" on pb_comments
  for select using (
    exists (select 1 from personal_bests pb where pb.id = pb_comments.pb_id and coach_can_access_athlete(pb.athlete_id))
  );

-- ------------------------------------------------------------
-- GROUP MEMBERS
-- The group itself (groups table) stays org-wide, but which specific
-- athletes are in it is athlete data — both the group's own org AND
-- the athlete's accessibility now need to hold.
-- ------------------------------------------------------------
drop policy if exists "Coaches manage group members" on group_members;

create policy "Coaches manage group members" on group_members
  for all using (
    coach_can_access_athlete(athlete_id)
    and exists (select 1 from groups g where g.id = group_members.group_id and g.organisation_id = my_organisation_id())
  ) with check (
    coach_can_access_athlete(athlete_id)
    and exists (select 1 from groups g where g.id = group_members.group_id and g.organisation_id = my_organisation_id())
  );

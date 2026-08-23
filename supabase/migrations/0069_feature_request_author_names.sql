-- ============================================================
-- 0069_feature_request_author_names.sql
-- ============================================================
-- The feature-requests board (0068) is deliberately global across
-- every organisation, but coaches.RLS ("Coaches view colleagues in
-- same org", 0001) only lets a coach see coaches in their OWN org -
-- so a request or comment posted by a coach in a DIFFERENT org would
-- silently resolve to no name at all via a normal embedded select.
--
-- Rather than loosen coaches' RLS generally (which would expose every
-- column - organisation_id, role, athlete_access - to any coach on
-- the platform, not just name), this is a narrow SECURITY DEFINER
-- function exposing only what the board actually needs: name and the
-- admin flag, for a given set of coach ids, regardless of org.
-- ============================================================

create or replace function get_coach_public_profiles(coach_ids uuid[])
returns table(id uuid, name text, is_app_admin boolean)
language sql
security definer
stable
as $$
  select id, name, is_app_admin from coaches where id = any(coach_ids)
$$;

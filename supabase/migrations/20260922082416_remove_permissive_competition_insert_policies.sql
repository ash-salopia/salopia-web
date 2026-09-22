-- These policies were labelled for service-role use but targeted PUBLIC.
-- The service role bypasses RLS and does not need them. Keeping them would
-- let any authenticated client insert competition data without the existing
-- coach_can_access_athlete() organisation boundary.

begin;

drop policy if exists "Service role insert competitions" on public.competitions;
drop policy if exists "Service role insert reactions" on public.competition_reactions;
drop policy if exists "Service role insert comments" on public.competition_comments;

commit;

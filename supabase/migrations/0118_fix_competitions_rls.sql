-- ============================================================
-- 0118_fix_competitions_rls.sql
-- ============================================================
-- Security fix (found 2026-10-16 in the pre-beta review): a logged-in
-- coach could read EVERY organisation's competitions, not just their
-- own. The policy in the migrations (0064, coach_can_access_athlete)
-- is correct, so an extra permissive policy must have been added to
-- the live database outside the migration files. RLS policies are
-- OR'd together, so one "allow everything" policy defeats the rest.
--
-- Fix: drop EVERY policy on competitions, whatever it's called, then
-- recreate only the intended one. Athletes' own competition reads and
-- writes go through the service-role /api/athlete-link/competitions
-- route, which bypasses RLS and checks the share token itself, so no
-- other policy is needed.
-- ============================================================

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'competitions'
  loop
    execute format('drop policy if exists %I on public.competitions', p.policyname);
  end loop;
end $$;

alter table public.competitions enable row level security;

create policy "Org members manage competitions" on public.competitions
  for all using (coach_can_access_athlete(athlete_id))
  with check (coach_can_access_athlete(athlete_id));

-- ------------------------------------------------------------
-- Check (run separately after this migration): lists any remaining
-- policy in the database that lets everyone see everything. Expect
-- only tables that are shared on purpose (Coach Forum, feature
-- requests). Anything else is worth a look.
--
-- select tablename, policyname, cmd, roles, qual
-- from pg_policies
-- where schemaname = 'public' and (qual = 'true' or with_check = 'true')
-- order by tablename;
-- ------------------------------------------------------------

-- ============================================================
-- 0006_grant_service_role_privileges.sql
-- ============================================================
-- Fixes a real gap from the original migrations: every table has
-- Row Level Security policies, but RLS only controls WHICH ROWS a
-- role can see once it's already allowed to query the table at all.
-- The baseline "can this role touch this table in any way" privilege
-- is a separate, more fundamental permission layer underneath RLS,
-- and none of the earlier migrations ever granted it explicitly.
--
-- This didn't surface immediately because Supabase grants its
-- `authenticated` role sensible default privileges automatically —
-- so every regular signed-in coach's queries (going through the
-- browser/server client) worked fine from the start. But
-- `service_role` — used server-side in app/auth/callback/route.ts to
-- provision a coach's first organisation, and in the athlete
-- share-link view — does NOT get those same defaults, and hit
-- "permission denied for table coaches" (Postgres error 42501) the
-- first time anyone actually tried to sign up.
--
-- service_role is designed to bypass RLS entirely (that's its whole
-- purpose — see lib/supabase-service.ts's warning comment), so these
-- grants are intentionally broad. The actual safety boundary for
-- service_role usage lives in the application code that uses it,
-- not in the database permissions themselves — see the defence-in-depth
-- checks in lib/data/athlete-share-link.ts for an example.
-- ============================================================

grant usage on schema public to service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;

-- Also apply to any tables/sequences created in the future, so this
-- doesn't need repeating for every new migration from here on.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on routines to service_role;

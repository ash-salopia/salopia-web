-- ============================================================
-- 0007_grant_authenticated_role_privileges.sql
-- ============================================================
-- Same category of issue as 0006, applied to the `authenticated`
-- role (every signed-in coach, via the regular browser/server
-- client) and `anon` (used briefly during the magic-link exchange
-- before a session is established). RLS policies control which ROWS
-- a role can see; they don't grant the baseline ability to query a
-- table at all — that's a separate privilege layer, and relying on
-- Supabase's default project-creation grants for it (rather than
-- being explicit here) is exactly what made the service_role gap in
-- migration 0006 hard to diagnose. Making every role's privileges
-- explicit, in version control, removes that ambiguity going forward.
--
-- Unlike service_role (which intentionally bypasses RLS entirely),
-- authenticated and anon still have their actual data access
-- controlled by the RLS policies from migrations 0001-0005 — these
-- grants only unlock the ability to ATTEMPT a query; RLS still
-- decides which rows come back.
-- ============================================================

grant usage on schema public to authenticated, anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- anon needs almost nothing in this app (the athlete share-link view
-- uses service_role server-side, not anon) but is granted schema
-- usage above for consistency/future-proofing rather than left
-- implicit.

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

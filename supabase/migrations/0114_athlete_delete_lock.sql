-- ============================================================
-- 0114_athlete_delete_lock.sql
-- ============================================================
-- Permanently deleting an athlete cascades to every session, PB and
-- test result they own, so it's now locked down (Ash, 2026-10-15):
--
--   * Owner-only by default. The owner can let other coaches delete
--     via the `coaches_can_delete_athletes` flag in organisations.settings
--     (jsonb, defaults false - see lib/data/settings.ts).
--   * Every delete needs the org's delete password, set by the owner
--     in Settings. The hash lives in org_secrets below, which has RLS
--     on and NO policies, so only the service role (server routes) can
--     read or write it - not even the owner's browser can see the hash.
--
-- The browser-side delete policy on athletes is dropped, so the only
-- way to delete an athlete is through /api/athletes/delete, which
-- checks role + password before deleting with the service role.
-- ============================================================

create table if not exists org_secrets (
  organisation_id uuid primary key references organisations(id) on delete cascade,
  athlete_delete_password_hash text,
  updated_at timestamptz not null default now()
);

alter table org_secrets enable row level security;
-- Intentionally no policies: service role only.

drop policy if exists "Coaches delete assigned athletes" on athletes;

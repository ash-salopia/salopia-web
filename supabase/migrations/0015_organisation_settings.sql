-- ============================================================
-- 0015_organisation_settings.sql
-- ============================================================
-- Adds a settings JSONB column to organisations.
-- Storing settings as JSONB means we can add new preferences
-- later without schema migrations — just add new keys.
--
-- Default settings shape:
-- {
--   "one_rm_formula": "lander",   // lander | epley | brzycki | oconner | lombardi
--   "weight_unit": "kg"            // kg | lbs
-- }
-- ============================================================

alter table organisations
  add column if not exists settings jsonb not null default '{}';

-- Backfill with sensible defaults for existing orgs
update organisations
set settings = '{"one_rm_formula": "lander", "weight_unit": "kg"}'
where settings = '{}';

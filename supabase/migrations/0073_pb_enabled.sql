-- ============================================================
-- 0073_pb_enabled.sql
-- ============================================================
-- Per-athlete override for the org-level `pb_enabled` setting
-- (lib/data/settings.ts, stored in organisations.settings jsonb, default
-- true) - same two-level toggle pattern as hyrox_enabled (0025): org
-- setting is the default, this column lets a coach switch Personal Bests
-- off for one specific athlete (e.g. PB pressure isn't motivating for
-- them) without affecting the rest of the org. Resolved everywhere as
-- `org.pb_enabled !== false && athlete.pb_enabled !== false`.
-- ============================================================

alter table athletes
  add column if not exists pb_enabled boolean not null default true;

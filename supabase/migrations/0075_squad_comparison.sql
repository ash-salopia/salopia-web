-- ============================================================
-- 0075_squad_comparison.sql
-- ============================================================
-- Per-athlete override of the org-level squad_comparison_enabled setting
-- (lib/data/settings.ts), same two-level toggle pattern as hyrox_enabled
-- (0025), pb_enabled (0073), and challenges_enabled (0074). Governs
-- whether "Compare to squad" is offered when generating this athlete's
-- individual Training Load Report.
-- ============================================================

alter table athletes
  add column if not exists squad_comparison_enabled boolean not null default true;

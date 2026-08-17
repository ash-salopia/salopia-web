-- ============================================================
-- 0059_squad_report_presets.sql
-- ============================================================
-- Extends report_presets (0057) to also hold Squad Report config
-- (TTL/e1RM/completion toggles, the exercise tick-list, trend
-- metric(s), limit-to-8) alongside the existing Athlete Reports
-- presets, rather than a second table - same jsonb-blob-per-row
-- shape, just tagged with which form it belongs to. A coach can
-- reuse a name across both kinds ("Monthly check-in" as both an
-- athlete preset and a squad preset) since the uniqueness constraint
-- now includes kind.
-- ============================================================

alter table report_presets
  add column if not exists kind text not null default 'athlete' check (kind in ('athlete', 'squad'));

alter table report_presets drop constraint if exists report_presets_organisation_id_name_key;
alter table report_presets add constraint report_presets_organisation_id_kind_name_key unique (organisation_id, kind, name);

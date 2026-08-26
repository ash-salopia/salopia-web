-- ============================================================
-- 0072_library_default_distance_unit.sql
-- Starting distance unit (m/km/mi) for a Cardio/Hyrox library exercise
-- - e.g. an Erg defaults to metres, a Treadmill to km - applied
-- wherever this entry is picked into a hyrox_config/cardio_config
-- exercise (HyroxCardioBuilder's LibraryAutocomplete), same pattern as
-- default_tracked_metrics (0070) and equipment (0071). Still just a
-- starting point - overridable per box from there.
-- ============================================================

alter table library_entries
  add column if not exists default_distance_unit text;

comment on column library_entries.default_distance_unit is 'DistanceUnit ("m"|"km"|"mi") | null — starting unit for this exercise''s distance box(es) when loaded into a session; null = falls back to "km" (0072)';

-- ============================================================
-- 0071_library_equipment.sql
-- Equipment type for a Cardio/Hyrox library exercise (erg, bike,
-- treadmill, bodyweight, other) - see EQUIPMENT_META in
-- lib/cardio-metrics.ts. Restricts which metrics that exercise can
-- track (e.g. a Treadmill exercise can't tick "watts"), applied
-- wherever it's picked into a hyrox_config/cardio_config exercise
-- (HyroxCardioBuilder's LibraryAutocomplete), same pattern as
-- default_tracked_metrics (0070).
-- ============================================================

alter table library_entries
  add column if not exists equipment text;

comment on column library_entries.equipment is 'EquipmentType | null — restricts which metrics this Cardio/Hyrox exercise can track (see EQUIPMENT_META); null = unrestricted (0071)';

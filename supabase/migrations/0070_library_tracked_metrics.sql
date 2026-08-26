-- ============================================================
-- 0070_library_tracked_metrics.sql
-- Default trackable metrics (distance, reps, avg HR, calories, watts,
-- cadence, etc. — see lib/cardio-metrics.ts MetricKey) for a Cardio/
-- Hyrox library exercise, same pattern as is_bodyweight/each_side/
-- use_percent_1rm (0048): coach ticks the boxes once on the library
-- entry, applied whenever that exercise is picked into a hyrox_config/
-- cardio_config exercise (HyroxCardioBuilder's LibraryAutocomplete),
-- overridable per exercise per session from there.
-- ============================================================

alter table library_entries
  add column if not exists default_tracked_metrics jsonb not null default '[]';

comment on column library_entries.default_tracked_metrics is 'MetricKey[] — default tracked_metrics for a hyrox_config/cardio_config exercise when this entry is loaded into a session (0070)';

-- ============================================================
-- 0096_ps_multi_metric.sql
-- ============================================================
-- Power/Speed exercises can now log several metrics at once
-- (e.g. a sled sprint = Load + Time + Distance; a med-ball throw
-- = Load + Reps + Distance) instead of a single measurement_type.
--
--  * session_exercises.ps_tracked_metrics — which metrics this P/S
--    exercise instance tracks. null / absent = fall back to the legacy
--    single measurement (still read from `tempo`) or the quality default.
--    Values are PSMetricKey strings (see lib/ps-metrics.ts):
--    'load' | 'reps' | 'time' | 'distance' | 'height' | 'velocity' |
--    'power' | 'rsi' | 'contact_time'.
--
--  * library_entries.default_ps_metrics — the preset applied when a
--    Power/Speed library exercise is loaded into a session.
--
-- The per-set log JSON shape also changes (rep_results[] -> set_metrics
-- + rep_metrics[]); old logs are read via normalizePSLog() at load, no
-- data migration needed.
-- ============================================================

alter table session_exercises
  add column if not exists ps_tracked_metrics jsonb;

alter table library_entries
  add column if not exists default_ps_metrics jsonb not null default '[]';

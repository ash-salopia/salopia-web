-- ============================================================
-- 0095_library_ps_quality_completion.sql
-- ============================================================
-- Two more Power/Speed library presets, applied when the exercise is
-- loaded into a Power/Speed session:
--
--  * default_ps_quality      — the movement type / quality
--    ('acceleration' | 'max_velocity' | 'plyometric' | 'cod' |
--     'deceleration' | ''); null / '' = General.
--  * default_completion_only — no metric to log, just a done tick
--    (mirrors session_exercises.completion_only for strength).
-- ============================================================

alter table library_entries
  add column if not exists default_ps_quality      text,
  add column if not exists default_completion_only boolean not null default false;

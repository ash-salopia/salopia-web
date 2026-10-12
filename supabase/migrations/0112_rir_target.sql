-- ============================================================
-- 0112_rir_target.sql
-- ============================================================
-- First step of RIR (Reps in Reserve) autoregulated programming
-- (researched live: "research programming repetitions in reserve
-- method and how we could build this into the programming side of
-- things"). A weighted exercise can now be prescribed by target RIR
-- per set, as a third mode alongside a fixed load and %1RM — the
-- coach sets "3x8 @ 2 RIR" instead of typing a weight or %, and the
-- app suggests a kg figure from the athlete's current resolved 1RM
-- and the published reps×RIR %1RM table (lib/rir-load.ts). Mirrors
-- 0045_percent_1rm_per_set.sql's use_percent_1rm/set_percents shape
-- exactly — same column types, same per-set JSONB array convention.
--
-- Only session_exercises needs new columns: template_defs/
-- programme_sessions store their exercises as one JSONB blob column
-- (not discrete columns per field), so PrescribedExercise's new
-- use_rir/set_rir fields (types/index.ts) ride along inside that
-- blob automatically once code writes them.
-- ============================================================

alter table session_exercises
  add column if not exists use_rir boolean not null default false,
  add column if not exists set_rir jsonb not null default '[]';

comment on column session_exercises.use_rir is 'When true, set_rir[i] prescribes each set''s own target Reps-in-Reserve instead of a fixed load or %1RM (0112)';
comment on column session_exercises.set_rir is 'Per-set target RIR prescriptions, index-aligned with sets/log — e.g. ["3","2","1"] for a set that gets harder as it goes. Converted to a suggested kg via lib/rir-load.ts and the athlete''s resolved 1RM, same pipeline as set_percents.';

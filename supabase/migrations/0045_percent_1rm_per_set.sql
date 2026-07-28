-- ============================================================
-- 0045_percent_1rm_per_set.sql
-- %1RM programming becomes per-set (a ramping scheme, e.g. set 1 @
-- 70%, set 2 @ 80%, set 3 @ 90%) rather than one value for the whole
-- exercise. Superseded 0032's single `percent_1rm` column, which is
-- left in place unused so old rows still read back.
-- ============================================================

alter table session_exercises
  add column if not exists use_percent_1rm boolean not null default false,
  add column if not exists set_percents jsonb not null default '[]';

comment on column session_exercises.use_percent_1rm is 'When true, set_percents[i] prescribes each set''s own %1RM instead of a single value for the whole exercise (0045, supersedes percent_1rm)';
comment on column session_exercises.set_percents is 'Per-set %1RM prescriptions, index-aligned with sets/log — e.g. ["70","80","90"] for a 3-set ramp';

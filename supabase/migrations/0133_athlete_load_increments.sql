-- ============================================================
-- 0133_athlete_load_increments.sql
-- An athlete's own gym weight steps, for the quick-pick load buttons
-- (lib/load-increments.ts): e.g. {"dumbbell":"2","kettlebell":4,
-- "plate":1.25,"machine":5}. Null = use the coach's default from org
-- settings (load_increments), else the app default. Set by the athlete
-- in the athlete app's Settings (via the token-checked
-- /api/athlete-link/load-increments route) or by the coach.
-- ============================================================

alter table athletes
  add column if not exists load_increments jsonb;

comment on column athletes.load_increments is 'Athlete''s own gym weight steps for quick-pick loads (dumbbell/kettlebell/plate/machine); null = coach default (0133)';

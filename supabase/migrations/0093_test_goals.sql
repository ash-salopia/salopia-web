-- ============================================================
-- 0093_test_goals.sql
-- ============================================================
-- Goals set against a physical-testing metric.
--
-- A coach (always) or the athlete (only when the org opts in via
-- settings.test_goals_athlete_editable) picks a test_metric, the
-- athlete's current best for that metric is snapshotted as the
-- baseline (start_value / start_value_date), and a target value +
-- target_date are set. Progress is recomputed at read time from
-- test_results, respecting the metric's better_direction.
--
-- show_on_calendar surfaces the target_date as a milestone marker
-- on the athlete's app calendar and the coach's athlete calendar.
-- ============================================================

alter table athlete_goals
  drop constraint if exists athlete_goals_goal_type_check;

alter table athlete_goals
  add constraint athlete_goals_goal_type_check
    check (goal_type in ('exercise', 'weight', 'time', 'text', 'test'));

alter table athlete_goals
  add column if not exists test_metric_id   uuid references test_metrics(id) on delete set null,
  add column if not exists start_value      numeric,
  add column if not exists start_value_date date,
  add column if not exists target_value     numeric,
  add column if not exists show_on_calendar boolean not null default false;

-- Fast lookup of the milestone markers for one athlete's calendar.
create index if not exists athlete_goals_calendar_idx
  on athlete_goals (athlete_id, target_date)
  where show_on_calendar;

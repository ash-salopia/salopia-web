-- ============================================================
-- 0108_session_time_of_day.sql
-- Optional AM/PM designation for a session - sessions default to
-- day-level scheduling only (no time), but a coach running a two-a-day
-- (e.g. AM strength, PM conditioning) can specify which one this is.
-- Shown on the right-hand side of the athlete app's week view.
-- ============================================================

alter table sessions
  add column if not exists time_of_day text;

alter table sessions
  drop constraint if exists sessions_time_of_day_check;

alter table sessions
  add constraint sessions_time_of_day_check
    check (time_of_day is null or time_of_day in ('am', 'pm'));

comment on column sessions.time_of_day is 'Optional "am"/"pm" designation for a two-a-day session - null (the default) means no specific time of day (0108)';

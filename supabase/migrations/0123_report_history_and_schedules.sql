-- ============================================================
-- 0123_report_history_and_schedules.sql
-- ============================================================
-- Builds on 0122 (shared_reports):
--
-- shared_reports
--   visible_to_athlete - shows in the athlete app's Reports tab
--   revoked_at         - coach cancelled the link (/r/<id> stops working)
--   style, range_label - for the "Reports sent" history list
--
-- report_schedules - one per athlete: every N weeks a report is due.
--   On the due date the coach gets an email + push with a link that
--   opens the report already built with the saved options, ready to
--   check the Coach's Verdict and send. (Reports carry AI-written
--   text, so a coach reviews before anything reaches an athlete or
--   parent.)
-- ============================================================

alter table shared_reports
  add column if not exists visible_to_athlete boolean not null default true,
  add column if not exists revoked_at timestamptz,
  add column if not exists style text not null default 'white',
  add column if not exists range_label text not null default '';

create index if not exists shared_reports_athlete_created_idx on shared_reports(athlete_id, created_at desc);

create table if not exists report_schedules (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  athlete_id      uuid not null references athletes(id) on delete cascade,
  created_by      uuid references coaches(id) on delete set null,
  every_weeks     int  not null default 4 check (every_weeks between 1 and 26),
  next_due        date not null,
  options         jsonb not null default '{}'::jsonb, -- ReportOptions to generate with
  active          boolean not null default true,
  last_reminded_at timestamptz,
  last_sent_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (athlete_id)
);

create index if not exists report_schedules_due_idx on report_schedules(next_due) where active;

alter table report_schedules enable row level security;

drop policy if exists "Coaches manage report schedules for their athletes" on report_schedules;
create policy "Coaches manage report schedules for their athletes" on report_schedules
  for all
  using (coach_can_access_athlete(athlete_id))
  with check (coach_can_access_athlete(athlete_id) and organisation_id = my_organisation_id());

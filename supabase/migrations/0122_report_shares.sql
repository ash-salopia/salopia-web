-- ============================================================
-- 0122_report_shares.sql
-- ============================================================
-- "Email report to client" from the Training Report.
--
-- athletes.contact_email: the address reports go to by default (the
-- athlete's own, or a parent's for a youth athlete). Athletes still
-- have no login - this is contact info only.
--
-- shared_reports: a snapshot of a generated report (the same light,
-- print-ready HTML the Print button produces), viewable without a login
-- at /r/<id>. The id is a random uuid, so the link is the key - same
-- model as athlete share links. Links stop working after 90 days.
-- Coaches only ever reach rows for athletes they can access; the
-- public /r/<id> page reads with the service role and checks expiry.
-- ============================================================

alter table athletes
  add column if not exists contact_email text;

create table if not exists shared_reports (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  athlete_id      uuid not null references athletes(id) on delete cascade,
  created_by      uuid references coaches(id) on delete set null,
  title           text not null default '',
  html            text not null,
  emailed_to      text[] not null default '{}',
  emailed_at      timestamptz,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '90 days'
);

create index if not exists shared_reports_org_created_idx on shared_reports(organisation_id, created_at desc);
create index if not exists shared_reports_athlete_idx on shared_reports(athlete_id);

alter table shared_reports enable row level security;

drop policy if exists "Coaches manage shared reports for their athletes" on shared_reports;
create policy "Coaches manage shared reports for their athletes" on shared_reports
  for all
  using (coach_can_access_athlete(athlete_id))
  with check (coach_can_access_athlete(athlete_id) and organisation_id = my_organisation_id());

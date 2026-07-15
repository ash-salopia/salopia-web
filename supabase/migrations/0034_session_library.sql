-- ============================================================
-- 0034_session_library.sql
-- ============================================================
-- "Session Library" — a coach can grant an athlete access to specific
-- templates from the Template Library, which the athlete can then
-- browse and log informally/standalone, separate from their actual
-- assigned/scheduled programme. Access is many-to-many at the
-- template level (not tied to a specific template_def or to a
-- specific day) — a template with multiple defs lets the athlete pick
-- which one to start.
-- ============================================================

create table athlete_template_access (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  template_id uuid not null references templates(id) on delete cascade,
  organisation_id uuid not null references organisations(id) on delete cascade,
  granted_by uuid not null references coaches(id) on delete cascade,
  granted_at timestamptz not null default now(),
  unique (athlete_id, template_id)
);

create index athlete_template_access_athlete_id_idx on athlete_template_access(athlete_id);
create index athlete_template_access_template_id_idx on athlete_template_access(template_id);

alter table athlete_template_access enable row level security;

-- Coach-side only. Athlete-side reads/writes for this feature go
-- through the athlete-link routes (service-role client + manual
-- ownership check against the athlete resolved from their share
-- token) — same pattern as every other athlete write path — never a
-- direct-RLS policy for athletes, since athletes have no auth.uid().
create policy "Coaches manage own org template access grants" on athlete_template_access
  for all using (organisation_id = my_organisation_id())
  with check (organisation_id = my_organisation_id());

-- Distinguishes a real scheduled/assigned session from one the
-- athlete started informally from their Session Library — lets the
-- Training Load Report and both calendars (coach + athlete) exclude
-- library sessions without touching PB detection, which keys off
-- athlete_id + exercise_name and doesn't care about provenance.
alter table sessions add column if not exists session_source text not null default 'programme'
  check (session_source in ('programme', 'library'));

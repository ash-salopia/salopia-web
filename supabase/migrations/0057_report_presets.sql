-- ============================================================
-- 0057_report_presets.sql
-- ============================================================
-- Named, reusable metric/component selections for the Reporting tab's
-- Athlete Reports form (the same ReportOptions shape already used by
-- the single-athlete report and the bulk PDF export) - lets a coach
-- save "the same metrics" once and reapply them to future reports
-- instead of re-ticking the same boxes every time.
--
-- Org-scoped (like templates/programmes), not per-coach: any coach in
-- the org can see and reuse a preset a colleague saved. Stored as a
-- single jsonb blob rather than one column per option, since
-- ReportOptions is read/written as a whole unit here (same reasoning
-- as template_defs.exercises in 0003) and grows over time as new
-- report options are added, without needing a migration each time.
--
-- unique (organisation_id, name) lets "Save as preset" double as an
-- update-in-place when the coach reuses an existing name, rather than
-- silently accumulating duplicates.
-- ============================================================

create table report_presets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  options jsonb not null,
  created_at timestamptz not null default now(),
  unique (organisation_id, name)
);

create index report_presets_organisation_id_idx on report_presets(organisation_id);

alter table report_presets enable row level security;

create policy "Coaches manage own org report presets" on report_presets
  for all using (organisation_id = my_organisation_id())
  with check (organisation_id = my_organisation_id());

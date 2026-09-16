-- ============================================================
-- 0099_import_batches.sql
-- ============================================================
-- Groundwork for the customer-migration tooling: a coach switching
-- from another platform bulk-imports their data (roster first, then
-- library / PBs / test results / sessions) via CSV.
--
-- Every import is recorded as one `import_batches` row, and every row
-- it creates carries that batch id (`import_batch_id`, added per table
-- as each importer is built — this migration adds it to `athletes`).
-- That makes an import fully undoable: "revert" deletes the rows with
-- that batch id. It also gives a clean audit trail of what came from
-- where.
--
-- NOTE ON NUMBERING: 0097/0098 belong to the concept2/strava
-- integration branch. If that branch merges after this one, renumber
-- there — nothing here depends on it.
-- ============================================================

create table if not exists import_batches (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references organisations(id) on delete cascade,
  created_by       uuid references coaches(id) on delete set null,
  entity           text not null check (entity in (
                     'athletes', 'library', 'pbs', 'test_results', 'sessions', 'body_metrics'
                   )),
  source_label     text,      -- free text from the coach, e.g. "TrainingPeaks export"
  filename         text,
  row_count        integer not null default 0,   -- rows in the uploaded file that were valid
  created_count    integer not null default 0,   -- rows actually written
  skipped_count    integer not null default 0,   -- duplicates / skipped
  status           text not null default 'complete'
                     check (status in ('complete', 'reverted')),
  created_at       timestamptz not null default now(),
  reverted_at      timestamptz
);

create index if not exists import_batches_org_idx on import_batches(organisation_id, created_at desc);

alter table import_batches enable row level security;

drop policy if exists "Coaches manage own org import batches" on import_batches;
create policy "Coaches manage own org import batches" on import_batches
  for all
  using (organisation_id = my_organisation_id())
  with check (organisation_id = my_organisation_id());

-- ── athletes: tag rows with the batch that created them ──────
-- on delete set null: deleting a batch row does NOT delete the
-- athletes (revert is an explicit, separate action that deletes the
-- athletes first, then the batch).
alter table athletes
  add column if not exists import_batch_id uuid references import_batches(id) on delete set null;

create index if not exists athletes_import_batch_idx
  on athletes(import_batch_id) where import_batch_id is not null;

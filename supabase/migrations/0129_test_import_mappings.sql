-- Testing results import (CSV / Excel / force plate PDF).
--
-- Remembers which column in a coach's export maps to which test metric,
-- so the second import from the same system (VALD, Hawkin, a timing
-- gate spreadsheet...) goes straight through without re-matching.
--
-- source_key is the normalised column label, prefixed with the export's
-- test type when it has one (e.g. "cmj::jump height imp-mom cm"), since
-- the same column name can mean different things for different tests.
-- test_metric_id null = "ignore this column" (also remembered).
-- scale converts the file's unit to the metric's (e.g. m -> cm = 100).

create table if not exists test_import_mappings (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  source_key      text not null,
  test_metric_id  uuid references test_metrics(id) on delete cascade,
  side            text check (side in ('left', 'right')),
  scale           numeric not null default 1,
  updated_at      timestamptz not null default now(),
  unique (organisation_id, source_key)
);

alter table test_import_mappings enable row level security;

create policy "Coaches manage own org test import mappings" on test_import_mappings
  for all using (organisation_id = my_organisation_id())
  with check (organisation_id = my_organisation_id());

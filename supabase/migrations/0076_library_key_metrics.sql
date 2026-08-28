-- "Key metrics" declutter: a Cardio/Hyrox library exercise can mark up
-- to 5 of its metrics as "key" — these show as ticked-visible checkboxes
-- everywhere that exercise is used, with the rest tucked behind a
-- "More" toggle. Independent of default_tracked_metrics (0070) — a
-- metric can be "key" (shown prominently) without being pre-ticked for
-- tracking, and vice versa.
alter table library_entries add column if not exists default_key_metrics jsonb not null default '[]';

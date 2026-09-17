-- ============================================================
-- 0100_documents_shared.sql
-- ============================================================
-- Redesigns Documents from "one row per athlete" to one document
-- shared with any number of athletes.
--
-- The old `athlete_documents` (0024) required a non-null athlete_id,
-- so "upload to everyone" / "upload to group" looped over every
-- recipient and inserted a full duplicate row PER ATHLETE — for a file
-- upload that meant re-uploading the same file to storage N times too.
-- 50 athletes, 50 copies of the file, 50 rows cluttering the list.
--
-- New shape: one `documents` row + a `document_athletes` join table
-- for who currently has access. "Everyone" / "a group" just inserts
-- join rows for the current roster at share time — the file and its
-- one DB row are never duplicated. Access can be edited afterwards
-- (add/remove athletes) without touching the document itself.
--
-- `athlete_documents` is left in place, untouched — nothing reads
-- it after this ships, but old rows aren't migrated automatically.
-- Each historical "everyone" broadcast is still N separate rows/files
-- there; collapsing them needs a judgement call (storage cleanup, not
-- just SQL) so it's left for a deliberate one-off pass rather than
-- guessed at here.
-- ============================================================

create table documents (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  created_by      uuid not null references coaches(id) on delete cascade,
  title           text not null,
  doc_type        text not null check (doc_type in ('file', 'video_link')),
  file_path       text,
  file_name       text,
  file_size       bigint,
  mime_type       text,
  video_url       text,
  notes           text,
  created_at      timestamptz not null default now()
);

create index documents_org_idx on documents(organisation_id);

-- Who currently has access. One row per (document, athlete) — "shared
-- with everyone" is just every active athlete's id inserted at share
-- time, not a special flag, so it reads the same way as any other
-- subset and can be edited the same way (add/remove rows).
create table document_athletes (
  document_id uuid not null references documents(id) on delete cascade,
  athlete_id  uuid not null references athletes(id) on delete cascade,
  primary key (document_id, athlete_id)
);

create index document_athletes_athlete_idx on document_athletes(athlete_id);

alter table documents enable row level security;
alter table document_athletes enable row level security;

-- Documents are an org-shared resource (same model as announcements/
-- groups), not per-athlete-owned data — so org-scoped, not gated by
-- coach_can_access_athlete() the way sessions/PBs/test results are.
-- A coach restricted to "assigned only" can still see and manage the
-- shared library of documents, same as they already can for groups
-- and announcements.
create policy "Coaches manage own org documents" on documents
  for all
  using (organisation_id = my_organisation_id())
  with check (organisation_id = my_organisation_id());

create policy "Coaches manage own org document access" on document_athletes
  for all
  using (exists (select 1 from documents d where d.id = document_athletes.document_id and d.organisation_id = my_organisation_id()))
  with check (exists (select 1 from documents d where d.id = document_athletes.document_id and d.organisation_id = my_organisation_id()));

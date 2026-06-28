create table athlete_documents (
  id              uuid primary key default gen_random_uuid(),
  athlete_id      uuid not null references athletes(id) on delete cascade,
  organisation_id uuid not null references organisations(id) on delete cascade,
  created_by      uuid not null references coaches(id) on delete cascade,
  title           text not null,
  doc_type        text not null check (doc_type in ('file', 'video_link')),
  file_url        text,
  file_path       text,
  file_name       text,
  file_size       bigint,
  mime_type       text,
  video_url       text,
  notes           text,
  created_at      timestamptz not null default now()
);

create index athlete_documents_athlete_idx on athlete_documents(athlete_id);
create index athlete_documents_org_idx on athlete_documents(organisation_id);

alter table athlete_documents enable row level security;

create policy "Coaches manage org documents" on athlete_documents
  for all using (
    organisation_id = my_organisation_id()
  )
  with check (
    organisation_id = my_organisation_id()
  );
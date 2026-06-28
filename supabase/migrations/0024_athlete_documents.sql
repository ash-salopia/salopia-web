-- ============================================================
-- 0024_athlete_documents.sql
-- Per-athlete document library: uploaded files + video links
-- Supports PDF, Word (.docx), Excel (.xlsx), and video URLs
-- File size cap enforced at application layer (10 MB)
-- ============================================================

create table athlete_documents (
  id              uuid primary key default gen_random_uuid(),
  athlete_id      uuid not null references athletes(id) on delete cascade,
  organisation_id uuid not null references organisations(id) on delete cascade,
  created_by      uuid not null references coaches(id) on delete cascade,

  title           text not null,
  doc_type        text not null check (doc_type in ('file', 'video_link')),

  -- File uploads (doc_type = 'file')
  file_url        text,          -- Supabase Storage public/signed URL
  file_path       text,          -- storage path for deletion
  file_name       text,          -- original filename for display
  file_size       bigint,        -- bytes
  mime_type       text,          -- e.g. application/pdf

  -- Video links (doc_type = 'video_link')
  video_url       text,

  notes           text,          -- optional coach note
  created_at      timestamptz not null default now()
);

create index athlete_documents_athlete_idx on athlete_documents(athlete_id);
create index athlete_documents_org_idx    on athlete_documents(organisation_id);

alter table athlete_documents enable row level security;

-- Coaches can do everything for their own org
create policy "Coaches manage org documents" on athlete_documents
  for all using (
    organisation_id = my_organisation_id()
  )
  with check (
    organisation_id = my_organisation_id()
  );

-- Athletes can read documents shared with them (via athlete-link API using service role)
-- No direct athlete RLS needed — athlete API routes use service role key

-- Storage bucket for athlete documents
-- Run separately in Supabase dashboard if needed:
-- insert into storage.buckets (id, name, public)
-- values ('athlete-documents', 'athlete-documents', false)
-- on conflict do nothing;

comment on table athlete_documents is
  'Per-athlete document library. Supports uploaded files (PDF/docx/xlsx, max 10MB) and video links.';

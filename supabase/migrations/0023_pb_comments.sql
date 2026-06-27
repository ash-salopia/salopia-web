-- ============================================================
-- 0023_pb_comments.sql
-- Comments on personal bests
-- ============================================================

create table pb_comments (
  id              uuid primary key default gen_random_uuid(),
  pb_id           uuid not null references personal_bests(id) on delete cascade,
  author_id       text not null,
  author_type     text not null check (author_type in ('athlete','coach')),
  author_name     text not null,
  body            text not null,
  created_at      timestamptz not null default now()
);

create index pb_comments_pb_idx on pb_comments(pb_id);

alter table pb_comments enable row level security;

create policy "Org members read pb comments" on pb_comments
  for select using (
    exists (
      select 1 from personal_bests pb
      join athletes a on a.id = pb.athlete_id
      where pb.id = pb_comments.pb_id
      and a.organisation_id = my_organisation_id()
    )
  );

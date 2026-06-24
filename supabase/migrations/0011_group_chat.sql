-- ============================================================
-- 0011_group_chat.sql
-- ============================================================
-- Real-time group messaging using Supabase Realtime.
-- Coaches and athletes (with accounts) can post to group channels.
-- ============================================================

create table group_messages (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups(id) on delete cascade,
  sender_type  text not null check (sender_type in ('coach', 'athlete')),
  sender_id    uuid not null,
  sender_name  text not null default '',
  body         text not null,
  created_at   timestamptz not null default now()
);

create index group_messages_group_id_idx on group_messages(group_id);
create index group_messages_created_at_idx on group_messages(group_id, created_at desc);

alter table group_messages enable row level security;

-- Coaches can read and write messages for groups in their org
create policy "Coaches manage group messages" on group_messages
  for all using (
    exists (
      select 1 from groups g
      where g.id = group_messages.group_id
        and g.organisation_id = my_organisation_id()
    )
  )
  with check (
    exists (
      select 1 from groups g
      where g.id = group_messages.group_id
        and g.organisation_id = my_organisation_id()
    )
  );

-- Enable Supabase Realtime for this table
-- Run this in the Supabase dashboard under Database > Replication
-- if the table doesn't appear in the Realtime section automatically:
-- alter publication supabase_realtime add table group_messages;

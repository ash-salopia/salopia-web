-- ============================================================
-- 0077_direct_messages.sql
-- ============================================================
-- Individual (1:1) coach<->athlete messaging, plus voice notes for
-- both this and the existing group chat.
--
-- direct_messages is a separate table from group_messages (not a
-- nullable-group-id redesign of it) since group_messages' RLS is
-- tightly coupled to the groups table (0011_group_chat.sql) - keeping
-- them separate avoids reworking that. One shared thread per athlete,
-- visible to every coach in the org (not private per coach) - matches
-- how the rest of the app works: sessions/PBs/notes are all
-- org-visible, not locked to whichever coach created them.
-- ============================================================

create table direct_messages (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  athlete_id      uuid not null references athletes(id) on delete cascade,
  sender_type     text not null check (sender_type in ('coach', 'athlete')),
  sender_id       uuid not null,
  sender_name     text not null default '',
  body            text not null default '',
  audio_path      text,
  audio_duration_seconds int,
  created_at      timestamptz not null default now(),
  constraint direct_messages_has_content check (body <> '' or audio_path is not null)
);

create index direct_messages_athlete_id_idx on direct_messages(athlete_id);
create index direct_messages_created_at_idx on direct_messages(athlete_id, created_at desc);

-- organisation_id is denormalised onto this table (rather than derived
-- via a join to athletes, like group_messages derives it via groups)
-- so push-notification lookups don't need an extra join - but that
-- means it must be reliably filled in on every insert. Auto-fill it
-- from athletes rather than trusting every INSERT call site (the
-- coach-side browser client, the athlete-link route) to remember to
-- pass it - a BEFORE INSERT trigger runs before the NOT NULL check, so
-- this is safe even though the column stays NOT NULL.
create or replace function set_direct_message_organisation() returns trigger as $$
begin
  if new.organisation_id is null then
    select organisation_id into new.organisation_id from athletes where id = new.athlete_id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger direct_messages_set_organisation
before insert on direct_messages
for each row execute function set_direct_message_organisation();

alter table direct_messages enable row level security;

-- Coaches can read and write messages for athletes in their org.
-- Athletes never touch this table directly - all athlete access goes
-- through the service-role athlete-link routes, same convention as
-- every other athlete-facing table.
create policy "Coaches manage direct messages" on direct_messages
  for all using (
    exists (
      select 1 from athletes a
      where a.id = direct_messages.athlete_id
        and a.organisation_id = my_organisation_id()
    )
  )
  with check (
    exists (
      select 1 from athletes a
      where a.id = direct_messages.athlete_id
        and a.organisation_id = my_organisation_id()
    )
  );

-- Enable Supabase Realtime for this table
-- Run this in the Supabase dashboard under Database > Replication
-- if the table doesn't appear in the Realtime section automatically:
-- alter publication supabase_realtime add table direct_messages;

-- Voice notes on the existing group chat too - same columns, same
-- upload/player components, reused rather than building this twice.
alter table group_messages add column if not exists audio_path text;
alter table group_messages add column if not exists audio_duration_seconds int;

-- Private bucket for both group and direct chat audio - created here
-- rather than left as a "run this in the dashboard" step, which is
-- exactly the mistake 0054_org_logos_bucket.sql's own comment
-- describes happening once already (a bucket that was only ever
-- documented as a manual step, never actually created, silently
-- breaking a feature at runtime). No client-side Storage policies are
-- needed: every upload goes through a service-role server route
-- (never a direct browser upload), so the bucket stays fully closed to
-- direct client access.
insert into storage.buckets (id, name, public)
values ('chat-audio', 'chat-audio', false)
on conflict (id) do nothing;

-- Per-notification-type opt-out for new messages, same pattern as
-- notify_pb/notify_missed_session/etc. (0062).
alter table coaches add column if not exists notify_message boolean not null default true;
alter table athletes add column if not exists notify_message boolean not null default true;

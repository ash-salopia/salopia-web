-- ============================================================
-- 0121_messaging_controls.sql
-- ============================================================
-- Lets a coach switch messaging off, with separate switches for
-- 1-to-1 coach messages (direct_messages) and group chat
-- (group_messages), at three levels:
--
--   • Whole account - organisations.settings jsonb keys
--     direct_messages_enabled / group_chat_enabled (no column needed,
--     missing = on; see OrgSettings in lib/data/settings.ts)
--   • Per athlete   - athletes.direct_messages_enabled / group_chat_enabled
--   • Per group     - groups.chat_enabled (that group's chat) and
--                     groups.direct_messages_enabled (coach messages for
--                     everyone in the group)
--
-- Off means hidden for the athlete AND no new messages either way.
-- Existing messages are kept, so switching back on restores the thread.
-- The app hides the UI; the triggers below are the actual guarantee,
-- so no route (coach RLS insert or athlete service-role insert) can
-- write a message while a switch is off.
-- ============================================================

alter table athletes
  add column if not exists direct_messages_enabled boolean not null default true,
  add column if not exists group_chat_enabled      boolean not null default true;

alter table groups
  add column if not exists chat_enabled            boolean not null default true,
  add column if not exists direct_messages_enabled boolean not null default true;

-- Coach messages allowed for this athlete? Account switch on, athlete
-- switch on, and no group they're in has coach messages off. Runs as
-- the caller (not security definer), so a coach only ever sees answers
-- for their own organisation's athletes.
create or replace function athlete_direct_messages_enabled(p_athlete_id uuid)
returns boolean
language sql stable
set search_path = public
as $$
  select coalesce((
    select coalesce((o.settings->>'direct_messages_enabled')::boolean, true)
       and a.direct_messages_enabled
       and not exists (
         select 1 from group_members gm
         join groups g on g.id = gm.group_id
         where gm.athlete_id = a.id and g.direct_messages_enabled = false
       )
    from athletes a
    join organisations o on o.id = a.organisation_id
    where a.id = p_athlete_id
  ), false);
$$;

-- Group chat allowed for this group? Account switch on and the group's
-- own switch on. (Whether a given athlete may post is checked
-- separately, in the trigger.)
create or replace function group_chat_enabled(p_group_id uuid)
returns boolean
language sql stable
set search_path = public
as $$
  select coalesce((
    select coalesce((o.settings->>'group_chat_enabled')::boolean, true)
       and g.chat_enabled
    from groups g
    join organisations o on o.id = g.organisation_id
    where g.id = p_group_id
  ), false);
$$;

create or replace function enforce_direct_messages_enabled()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not athlete_direct_messages_enabled(new.athlete_id) then
    raise exception 'Messaging is turned off for this athlete' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists direct_messages_enabled_check on direct_messages;
create trigger direct_messages_enabled_check
  before insert on direct_messages
  for each row execute function enforce_direct_messages_enabled();

create or replace function enforce_group_chat_enabled()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not group_chat_enabled(new.group_id) then
    raise exception 'Group chat is turned off for this group' using errcode = 'P0001';
  end if;
  if new.sender_type = 'athlete' and exists (
    select 1 from athletes where id = new.sender_id and group_chat_enabled = false
  ) then
    raise exception 'Group chat is turned off for this athlete' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists group_messages_enabled_check on group_messages;
create trigger group_messages_enabled_check
  before insert on group_messages
  for each row execute function enforce_group_chat_enabled();

-- ============================================================
-- 0134_coach_permissions.sql
-- ============================================================
-- Owner-controlled coach permissions (Settings -> Coach permissions,
-- plus per-coach switches in Settings -> Team). Ash, 2026-11-27.
--
--   Data export      organisations.settings.export_access
--                    'off' | 'owner' (default) | 'all', plus
--                    coaches.can_export - the owner lets one coach
--                    export while the account is on 'owner'.
--                    Enforced in /api/export (server route) - this
--                    file only adds the per-coach column.
--
--   Contact details  organisations.settings.coaches_see_contact_details
--                    (missing = true, today's behaviour). Off = only
--                    the owner can see or change an athlete's contact
--                    email. The email moves off `athletes` (which every
--                    coach can read) into athlete_contacts, which has
--                    NO browser policies: coaches go through the two
--                    functions below, which check the switch. Server
--                    routes (store, report emails) use the service role.
--
--   Messaging        coaches.can_message (default true). Off = that
--                    coach can't send 1-to-1 messages, group chat
--                    messages or announcements. They can still read.
--                    Triggers below are the guarantee, the app just
--                    hides the composer.
--
-- Deleting athletes is unchanged (0114) - its switch just moves into
-- the same Settings section.
--
-- ORDER: deploy the code first, then run this. The new code falls back
-- to athletes.contact_email until this has run; the old code would
-- break once the column below is dropped.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Per-coach switches (owner-only to change: added to the 0126 guard)
-- ------------------------------------------------------------
alter table coaches
  add column if not exists can_export  boolean not null default false,
  add column if not exists can_message boolean not null default true;

create or replace function coaches_guard_protected_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated' and (
       new.role is distinct from old.role
    or new.organisation_id is distinct from old.organisation_id
    or new.archived is distinct from old.archived
    or new.athlete_access is distinct from old.athlete_access
    or new.is_app_admin is distinct from old.is_app_admin
    or new.can_manage_store is distinct from old.can_manage_store
    or new.can_export is distinct from old.can_export
    or new.can_message is distinct from old.can_message
  ) then
    raise exception 'Only the account owner can change this' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- Contact details
-- ------------------------------------------------------------
create table if not exists athlete_contacts (
  athlete_id      uuid primary key references athletes(id) on delete cascade,
  organisation_id uuid not null references organisations(id) on delete cascade,
  contact_email   text,
  updated_at      timestamptz not null default now()
);
create index if not exists athlete_contacts_org_email_idx on athlete_contacts(organisation_id, lower(contact_email));

alter table athlete_contacts enable row level security;
-- Intentionally no policies: service role, or the functions below.

insert into athlete_contacts (athlete_id, organisation_id, contact_email)
select id, organisation_id, contact_email from athletes
where contact_email is not null and contact_email <> ''
on conflict (athlete_id) do update set contact_email = excluded.contact_email;

-- Can the signed-in coach see contact details at all? Owner always;
-- other coaches unless the owner has switched it off.
create or replace function coach_can_see_contacts()
returns boolean
language sql
security definer
stable
set search_path = public, auth, extensions
as $$
  select exists (
    select 1 from coaches c
    join organisations o on o.id = c.organisation_id
    where c.id = auth.uid() and c.archived = false
      and (c.role = 'owner' or coalesce((o.settings->>'coaches_see_contact_details')::boolean, true))
  )
$$;

-- { visible, email, has_email } for one athlete. has_email lets a coach
-- who can't see the address still send a report to it (the server
-- route looks it up), without ever showing it.
create or replace function athlete_contact(p_athlete_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, auth, extensions
as $$
declare
  v_email text;
  v_visible boolean;
begin
  if not coach_can_access_athlete(p_athlete_id) then
    raise exception 'Athlete not found' using errcode = '42501';
  end if;
  select contact_email into v_email from athlete_contacts where athlete_id = p_athlete_id;
  v_visible := coach_can_see_contacts();
  return jsonb_build_object(
    'visible', v_visible,
    'email', case when v_visible then v_email else null end,
    'has_email', coalesce(v_email, '') <> ''
  );
end;
$$;

create or replace function set_athlete_contact(p_athlete_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_org uuid;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  if not coach_can_access_athlete(p_athlete_id) then
    raise exception 'Athlete not found' using errcode = '42501';
  end if;
  if not coach_can_see_contacts() then
    raise exception 'Only the account owner can change contact details' using errcode = '42501';
  end if;
  select organisation_id into v_org from athletes where id = p_athlete_id;
  insert into athlete_contacts (athlete_id, organisation_id, contact_email, updated_at)
  values (p_athlete_id, v_org, v_email, now())
  on conflict (athlete_id) do update set contact_email = excluded.contact_email, updated_at = now();
end;
$$;

revoke execute on function public.coach_can_see_contacts() from public, anon;
revoke execute on function public.athlete_contact(uuid) from public, anon;
revoke execute on function public.set_athlete_contact(uuid, text) from public, anon;
grant execute on function public.coach_can_see_contacts() to authenticated;
grant execute on function public.athlete_contact(uuid) to authenticated;
grant execute on function public.set_athlete_contact(uuid, text) to authenticated;

alter table athletes drop column if exists contact_email;

-- ------------------------------------------------------------
-- Messaging per coach
-- ------------------------------------------------------------
create or replace function coach_messaging_blocked(p_coach_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, auth, extensions
as $$
  select exists (
    select 1 from coaches
    where id in (p_coach_id, auth.uid()) and role <> 'owner' and can_message = false
  )
$$;
revoke execute on function public.coach_messaging_blocked(uuid) from public, anon;
grant execute on function public.coach_messaging_blocked(uuid) to authenticated, service_role;

create or replace function enforce_coach_can_message()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.sender_type = 'coach' and coach_messaging_blocked(new.sender_id) then
    raise exception 'The account owner has turned off messaging for you' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists direct_messages_coach_can_message on direct_messages;
create trigger direct_messages_coach_can_message
  before insert on direct_messages
  for each row execute function enforce_coach_can_message();

drop trigger if exists group_messages_coach_can_message on group_messages;
create trigger group_messages_coach_can_message
  before insert on group_messages
  for each row execute function enforce_coach_can_message();

create or replace function enforce_coach_can_announce()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coach_messaging_blocked(new.coach_id) then
    raise exception 'The account owner has turned off messaging for you' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists announcements_coach_can_message on announcements;
create trigger announcements_coach_can_message
  before insert on announcements
  for each row execute function enforce_coach_can_announce();

commit;

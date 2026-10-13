-- ============================================================
-- 0113_live_group_limits.sql
-- ============================================================
-- Plan-based Live Group limits: an athlete cap and an active-device
-- limit with a take-over flow. The actual numbers live in ONE place,
-- lib/billing/live-group-limits.ts — the server routes read them there
-- and pass them in. Nothing in this file hardcodes a limit.
--
-- Four parts:
--
--  1. Billing columns on organisations become server-only. 0060 lets an
--     org OWNER update their own organisations row from the browser
--     (needed for settings/branding), which also meant they could
--     rewrite their own plan / seat_limit / subscription_status and
--     bypass every plan limit, including check_seat_limit(). The app
--     only ever changes those from the Stripe webhook / billing routes
--     (service role), so block them for browser (authenticated/anon)
--     requests. The SQL editor and service role are unaffected.
--
--  2. Starring an athlete into the Live Group (in_live_group false ->
--     true) becomes server-only, so the athlete cap in
--     /api/live-group/star can't be skipped by writing the column
--     directly. Un-starring and "Clear live group" stay as they were.
--     in_live_group is ONE shared group per organisation (0009), so
--     the cap is per subscription, not per coach.
--
--  3. live_group_devices: which browsers currently control Live Group.
--     A device is ACTIVE while displaced_at is null and it has sent a
--     heartbeat in the last 90s. Coaches can read their org's rows
--     (org-wide count + the other coach's name in the take-over modal);
--     all writes go through live_group_claim() from a server route, so
--     a coach can't mark their own device active and skip the limit.
--
--  4. live_group_can_write(): the server-side check every Live Group
--     write runs through. A write is accepted if this device has
--     control, OR it was logged before this device lost control — so
--     sets logged offline before a take-over still save when the
--     device reconnects (Ash's decision, 2026-10-13).
--
-- Plus three small atomic helpers that change ONE set of an exercise's
-- log instead of rewriting the whole array, so a device reconnecting
-- with queued saves can't overwrite sets another device logged since.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Shared helper: is this request coming from the browser (a
-- signed-in or anonymous Data API call) rather than the service
-- role / SQL editor?
-- ------------------------------------------------------------
create or replace function is_browser_request()
returns boolean
language sql
stable
set search_path = public, auth, extensions
as $$
  select coalesce(auth.jwt() ->> 'role', '') in ('authenticated', 'anon')
$$;

revoke execute on function is_browser_request() from public, anon;
grant execute on function is_browser_request() to authenticated, service_role;

-- ------------------------------------------------------------
-- 1. Billing columns are server-only
-- ------------------------------------------------------------
create or replace function guard_org_billing_columns()
returns trigger
language plpgsql
set search_path = public, auth, extensions
as $$
begin
  if is_browser_request() and (
       new.plan                   is distinct from old.plan
    or new.seat_limit             is distinct from old.seat_limit
    or new.subscription_status    is distinct from old.subscription_status
    or new.stripe_customer_id     is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.past_due_since         is distinct from old.past_due_since
    or new.billing_interval       is distinct from old.billing_interval
  ) then
    raise exception 'BILLING_FIELDS_READ_ONLY: plan and billing fields can only be changed by the billing system';
  end if;
  return new;
end;
$$;

revoke execute on function guard_org_billing_columns() from public, anon, authenticated;

drop trigger if exists guard_org_billing_columns on organisations;
create trigger guard_org_billing_columns
  before update on organisations
  for each row
  execute function guard_org_billing_columns();

-- ------------------------------------------------------------
-- 2. Starring into the Live Group is server-only
-- ------------------------------------------------------------
create or replace function guard_live_group_star()
returns trigger
language plpgsql
set search_path = public, auth, extensions
as $$
begin
  if is_browser_request()
     and new.in_live_group
     and (tg_op = 'INSERT' or not old.in_live_group) then
    raise exception 'LIVE_GROUP_STAR_SERVER_ONLY: add athletes to the Live Group through the app';
  end if;
  return new;
end;
$$;

revoke execute on function guard_live_group_star() from public, anon, authenticated;

drop trigger if exists guard_live_group_star on athletes;
create trigger guard_live_group_star
  before insert or update of in_live_group on athletes
  for each row
  execute function guard_live_group_star();

-- ------------------------------------------------------------
-- 3. Active Live Group devices
-- ------------------------------------------------------------
create table if not exists live_group_devices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  coach_id uuid not null references coaches(id) on delete cascade,
  device_id text not null,           -- random id kept in localStorage per browser
  device_label text not null default '',  -- "iPad", "iPhone", "Mac"…
  started_at timestamptz not null default now(),  -- when it (last) took control
  last_seen_at timestamptz not null default now(),
  -- Set when another device took over (or the limit was full when this
  -- one came back). null = this device holds control while its
  -- heartbeat is fresh.
  displaced_at timestamptz,
  displaced_by_coach_id uuid references coaches(id) on delete set null,
  displaced_by_label text,
  unique (organisation_id, device_id)
);

create index if not exists live_group_devices_org_idx on live_group_devices(organisation_id);

alter table live_group_devices enable row level security;

drop policy if exists "Coaches read own org live group devices" on live_group_devices;
create policy "Coaches read own org live group devices" on live_group_devices
  for select using (organisation_id = my_organisation_id());
-- No insert/update/delete policies on purpose: every write goes through
-- live_group_claim() from /api/live-group/device (service role), which
-- applies the plan's limit.

-- Claims (or keeps) control of Live Group for one device. Service-role
-- only: the route derives p_org/p_coach from the signed-in session and
-- p_max from lib/billing/live-group-limits.ts (null = unlimited).
--
-- p_mode:
--   'open'      page just opened — claim if there's room, else report full
--   'heartbeat' periodic ping — keep control; report if it was taken
--   'takeover'  claim, displacing the org's longest-running active device
--               if the limit is full
--
-- Returns { status: 'active' | 'full' | 'displaced', ... }.
create or replace function live_group_claim(
  p_org uuid,
  p_coach uuid,
  p_device text,
  p_label text,
  p_max integer,
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  fresh constant interval := interval '90 seconds';
  mine live_group_devices%rowtype;
  active_others integer;
  victim live_group_devices%rowtype;
begin
  -- One claim at a time per org, so two devices taking over in the same
  -- instant can't both end up active over the limit.
  perform pg_advisory_xact_lock(hashtext('live_group_claim:' || p_org::text));

  select * into mine from live_group_devices
   where organisation_id = p_org and device_id = p_device;

  -- Already in control and fresh: just refresh the heartbeat.
  if found and mine.displaced_at is null and mine.last_seen_at > now() - fresh then
    update live_group_devices
       set last_seen_at = now(), coach_id = p_coach, device_label = p_label
     where id = mine.id;
    return jsonb_build_object('status', 'active');
  end if;

  -- A heartbeat from a device that lost control: tell it who took over,
  -- don't quietly re-claim.
  if found and mine.displaced_at is not null and p_mode = 'heartbeat' then
    return jsonb_build_object(
      'status', 'displaced',
      'by_coach_id', mine.displaced_by_coach_id,
      'by_label', mine.displaced_by_label
    );
  end if;

  select count(*) into active_others from live_group_devices
   where organisation_id = p_org
     and device_id <> p_device
     and displaced_at is null
     and last_seen_at > now() - fresh;

  if p_max is not null and active_others >= p_max then
    if p_mode <> 'takeover' then
      -- A device whose heartbeat lapsed (phone locked, signal lost) and
      -- came back to find the limit full: mark it as having lost
      -- control, so it can't keep writing as if it still had it.
      if found and mine.displaced_at is null then
        update live_group_devices set displaced_at = now() where id = mine.id;
      end if;
      return jsonb_build_object('status', 'full');
    end if;

    -- Take over from the longest-running active device.
    select * into victim from live_group_devices
     where organisation_id = p_org
       and device_id <> p_device
       and displaced_at is null
       and last_seen_at > now() - fresh
     order by started_at asc
     limit 1;
    update live_group_devices
       set displaced_at = now(), displaced_by_coach_id = p_coach, displaced_by_label = p_label
     where id = victim.id;
  end if;

  insert into live_group_devices
    (organisation_id, coach_id, device_id, device_label, started_at, last_seen_at,
     displaced_at, displaced_by_coach_id, displaced_by_label)
  values (p_org, p_coach, p_device, p_label, now(), now(), null, null, null)
  on conflict (organisation_id, device_id) do update
    set coach_id = excluded.coach_id,
        device_label = excluded.device_label,
        started_at = now(),
        last_seen_at = now(),
        displaced_at = null,
        displaced_by_coach_id = null,
        displaced_by_label = null;

  return jsonb_build_object('status', 'active');
end;
$$;

revoke execute on function live_group_claim(uuid, uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function live_group_claim(uuid, uuid, text, text, integer, text) to service_role;

-- ------------------------------------------------------------
-- 4. May this device write to Live Group right now?
-- ------------------------------------------------------------
-- Uses the caller's own session (auth.uid()), never a passed-in org.
-- p_logged_at is when the coach made the change on the device (it can
-- be in the past for a save that was queued offline); it's capped at
-- now() so a wrong device clock can't stretch the window forwards.
create or replace function live_group_can_write(p_device text, p_logged_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public, auth, extensions
as $$
  select exists (
    select 1 from live_group_devices d
     where d.organisation_id = my_organisation_id()
       and d.device_id = p_device
       and d.coach_id = auth.uid()
       and (d.displaced_at is null or least(p_logged_at, now()) < d.displaced_at)
  )
$$;

revoke execute on function live_group_can_write(text, timestamptz) from public, anon;
grant execute on function live_group_can_write(text, timestamptz) to authenticated, service_role;

-- ------------------------------------------------------------
-- Atomic single-set log edits (security invoker: the caller's normal
-- RLS on session_exercises still decides whether they may write).
-- ------------------------------------------------------------

-- Merge p_patch into log[p_index]. An index one past the end appends.
create or replace function live_group_patch_set(p_exercise uuid, p_index integer, p_patch jsonb)
returns jsonb
language plpgsql
set search_path = public, auth, extensions
as $$
declare
  result jsonb;
begin
  update session_exercises
     set log = case
       when p_index < jsonb_array_length(log)
         then jsonb_set(log, array[p_index::text], (log -> p_index) || p_patch)
       when p_index = jsonb_array_length(log)
         then log || jsonb_build_array(p_patch)
       else log
     end
   where id = p_exercise
  returning log into result;
  if result is null then
    raise exception 'EXERCISE_NOT_FOUND';
  end if;
  return result;
end;
$$;

-- Append p_set, but only if the log is still p_expected_len long — a
-- retried "add set" can't add the same set twice.
create or replace function live_group_append_set(p_exercise uuid, p_expected_len integer, p_set jsonb)
returns jsonb
language plpgsql
set search_path = public, auth, extensions
as $$
declare
  result jsonb;
begin
  update session_exercises
     set log = case when jsonb_array_length(log) = p_expected_len
                    then log || jsonb_build_array(p_set) else log end
   where id = p_exercise
  returning log into result;
  if result is null then
    raise exception 'EXERCISE_NOT_FOUND';
  end if;
  return result;
end;
$$;

-- Drop the last set, but only if the log is still p_expected_len long
-- and that set is empty and not done — never discards a logged set.
create or replace function live_group_remove_last_set(p_exercise uuid, p_expected_len integer)
returns jsonb
language plpgsql
set search_path = public, auth, extensions
as $$
declare
  result jsonb;
begin
  update session_exercises
     set log = case
       when jsonb_array_length(log) = p_expected_len
        and jsonb_array_length(log) > 1
        and coalesce((log -> -1 ->> 'done')::boolean, false) = false
        and coalesce(log -> -1 ->> 'weight', '')   = ''
        and coalesce(log -> -1 ->> 'reps', '')     = ''
        and coalesce(log -> -1 ->> 'time', '')     = ''
        and coalesce(log -> -1 ->> 'velocity', '') = ''
        and coalesce(log -> -1 ->> 'pause', '')    = ''
       then log - (jsonb_array_length(log) - 1)
       else log
     end
   where id = p_exercise
  returning log into result;
  if result is null then
    raise exception 'EXERCISE_NOT_FOUND';
  end if;
  return result;
end;
$$;

revoke execute on function live_group_patch_set(uuid, integer, jsonb) from public, anon;
revoke execute on function live_group_append_set(uuid, integer, jsonb) from public, anon;
revoke execute on function live_group_remove_last_set(uuid, integer) from public, anon;
grant execute on function live_group_patch_set(uuid, integer, jsonb) to authenticated, service_role;
grant execute on function live_group_append_set(uuid, integer, jsonb) to authenticated, service_role;
grant execute on function live_group_remove_last_set(uuid, integer) to authenticated, service_role;

commit;

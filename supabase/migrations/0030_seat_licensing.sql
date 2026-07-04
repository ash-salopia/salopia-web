-- ============================================================
-- 0030_seat_licensing.sql
-- ============================================================
-- Groundwork for seat-based licensing. An organisation's plan caps
-- how many active (non-archived) athletes it can have — this is
-- deliberately enforced in the database via a trigger, not just in
-- application code, so it can't be bypassed by a bug or a future
-- direct-SQL edit.
--
-- This migration captures schema that was already applied directly
-- via the Supabase SQL editor at some earlier point and never
-- committed here. It's written to be idempotent (safe to re-run
-- against production, where all of this already exists) and to
-- bootstrap the same setup on a fresh dev/staging database.
--
-- `seat_limit` defaults to NULL ("unlimited") so every existing
-- organisation is unaffected until a limit is deliberately set for
-- a given plan/customer. There is no billing integration yet — this
-- is just the enforcement mechanism, not wired to real billing/tiers.
-- ============================================================

alter table organisations add column if not exists plan text not null default 'trial';
alter table organisations add column if not exists seat_limit integer default null;

-- ------------------------------------------------------------
-- Enforce seat_limit on athlete creation. Counts only active
-- (non-archived) athletes, matching the way seats are actually
-- consumed day-to-day — archiving an athlete frees their seat.
-- ------------------------------------------------------------
create or replace function check_seat_limit()
returns trigger
language plpgsql
as $$
declare
  current_count integer;
  org_limit integer;
begin
  select seat_limit into org_limit
  from organisations where id = new.organisation_id;

  -- NULL limit = unlimited
  if org_limit is null then
    return new;
  end if;

  select count(*) into current_count
  from athletes
  where organisation_id = new.organisation_id
    and archived = false;

  if current_count >= org_limit then
    raise exception 'SEAT_LIMIT_REACHED: organisation has % of % seats used', current_count, org_limit;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_seat_limit on athletes;
create trigger enforce_seat_limit
  before insert on athletes
  for each row
  execute function check_seat_limit();

-- ============================================================
-- 0030_seat_licensing.sql
-- ============================================================
-- Groundwork for seat-based licensing. An organisation's plan caps
-- how many active (non-archived) athletes it can have — this is
-- deliberately enforced in the database via a trigger, not just in
-- application code, so it can't be bypassed by a bug or a future
-- direct-SQL edit.
--
-- `seat_limit` defaults to NULL ("unlimited") so every existing
-- organisation is unaffected until a limit is deliberately set for
-- a given plan/customer. There is no billing integration yet — this
-- is just the enforcement mechanism or wiring in when that exists.
-- ============================================================

alter table organisations add column plan text not null default 'trial';
alter table organisations add column seat_limit integer default null;

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
  v_seat_limit integer;
  v_active_count integer;
begin
  select seat_limit into v_seat_limit
  from organisations
  where id = new.organisation_id;

  if v_seat_limit is not null then
    select count(*) into v_active_count
    from athletes
    where organisation_id = new.organisation_id
      and archived = false;

    if v_active_count >= v_seat_limit then
      raise exception 'SEAT_LIMIT_EXCEEDED: plan allows % active athlete(s)', v_seat_limit;
    end if;
  end if;

  return new;
end;
$$;

create trigger athletes_check_seat_limit
  before insert on athletes
  for each row
  execute function check_seat_limit();

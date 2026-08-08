-- ============================================================
-- 0050_coach_invites.sql
-- ============================================================
-- Lets an organisation owner invite a colleague coach by email
-- instead of every first-ever sign-in spinning up its own brand-new
-- organisation. See app/api/coaches/invite/route.ts and
-- lib/auth/ensure-coach-provisioned.ts for the app-side flow.
--
-- coach_seat_limit mirrors organisations.seat_limit (0030) but is a
-- SEPARATE counter for coaches, not athletes — a coaching business's
-- plan can cap headcount independently of athlete capacity.
--
-- coaches.email is a deliberate denormalisation: the client can never
-- read auth.users directly (no RLS access to the auth schema), but
-- the existing "view colleagues in same org" policy on coaches already
-- lets a coach see their teammates' rows, so mirroring email onto
-- coaches is what lets a Team list show colleagues' emails without a
-- service-role round trip.
--
-- coaches.accepted_at distinguishes a pending invite (row exists,
-- nobody has logged in yet) from an active coach. Existing rows all
-- self-provisioned on their own first sign-in, so they're backfilled
-- as already-accepted.
-- ============================================================

alter table organisations add column if not exists coach_seat_limit integer default null;

alter table coaches add column if not exists email text;
alter table coaches add column if not exists accepted_at timestamptz;

-- One-time backfill for existing rows (idempotent: only touches nulls).
update coaches c
set email = u.email
from auth.users u
where c.id = u.id and c.email is null;

update coaches
set accepted_at = created_at
where accepted_at is null;

comment on column coaches.email is 'Denormalized from auth.users so org-mates can be listed via the existing coaches RLS policy without a service-role round trip';
comment on column coaches.accepted_at is 'Null = invite sent but not yet accepted (pending). Set on first successful login. Pre-existing rows were backfilled to created_at since self-signup was itself the acceptance.';
comment on column organisations.coach_seat_limit is 'NULL = unlimited. Separate from seat_limit, which caps athletes, not coaches.';

-- ------------------------------------------------------------
-- Enforce coach_seat_limit on coach creation (invite or self-signup).
-- Counts ALL coaches for the org, pending or accepted — a pending
-- invite still reserves a seat, matching how the invite flow's own
-- app-level pre-check reasons about capacity.
-- ------------------------------------------------------------
create or replace function check_coach_seat_limit()
returns trigger
language plpgsql
as $$
declare
  current_count integer;
  org_limit integer;
begin
  select coach_seat_limit into org_limit
  from organisations where id = new.organisation_id;

  -- NULL limit = unlimited
  if org_limit is null then
    return new;
  end if;

  select count(*) into current_count
  from coaches
  where organisation_id = new.organisation_id;

  if current_count >= org_limit then
    raise exception 'COACH_SEAT_LIMIT_REACHED: organisation has % of % coach seats used', current_count, org_limit;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_coach_seat_limit on coaches;
create trigger enforce_coach_seat_limit
  before insert on coaches
  for each row
  execute function check_coach_seat_limit();

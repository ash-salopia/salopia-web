-- ============================================================
-- 0051_coach_archive.sql
-- ============================================================
-- Lets an organisation owner instantly cut off a coach's access
-- without deleting their account or cascading away anything they've
-- authored (community posts, uploaded documents, session-library
-- grants all cascade-delete from coaches.id -- archiving must avoid
-- that). Mirrors the existing athletes.archived pattern
-- (lib/data/athletes.ts's archiveAthlete/unarchiveAthlete).
--
-- The enforcement point is my_organisation_id() itself (0001) --
-- nearly every RLS policy in this schema keys off it, so making it
-- return NULL for an archived coach locks them out of everything
-- with a single change, no per-table policy edits needed. Since
-- security definer means this function's own internal lookup
-- bypasses RLS, there's no circularity risk from redefining it.
--
-- Side effect (intentional, handled in app/(coach)/layout.tsx): an
-- archived coach also loses the ability to read their OWN coaches/
-- organisations row via the normal RLS-scoped client, since the only
-- SELECT policy on coaches already depends on my_organisation_id()
-- too. A clear "you've been paused" message needs a service-role
-- read, not a client-side RLS bypass.
-- ============================================================

alter table coaches add column if not exists archived boolean not null default false;
comment on column coaches.archived is 'Non-destructive access lockout, set by the org owner. Unlike deleting the auth user, this preserves the coach''s authored content. See my_organisation_id() below for how this is enforced.';

create or replace function my_organisation_id()
returns uuid
language sql
security definer
stable
as $$
  select organisation_id from coaches where id = auth.uid() and archived = false
$$;

-- Seat-limit trigger (added in 0050) now also frees a seat when a
-- coach is archived, and re-checks the limit on reactivation --
-- deliberately going further than athletes.archived, which has no
-- such re-check on unarchive (an oversight there, not a pattern
-- worth mirroring -- don't "fix" this to match it later).
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

  if org_limit is null then
    return new;
  end if;

  select count(*) into current_count
  from coaches
  where organisation_id = new.organisation_id
    and archived = false;

  if current_count >= org_limit then
    raise exception 'COACH_SEAT_LIMIT_REACHED: organisation has % of % coach seats used', current_count, org_limit;
  end if;

  return new;
end;
$$;

-- Two separate triggers rather than one combined "insert or update"
-- trigger, deliberately: a WHEN clause referencing OLD is only
-- unambiguously valid for UPDATE (OLD doesn't exist for INSERT), so
-- splitting avoids relying on how Postgres would resolve that for a
-- combined-event trigger.
--
-- Fresh invite/self-signup: always check (archived defaults false).
drop trigger if exists enforce_coach_seat_limit on coaches;
create trigger enforce_coach_seat_limit
  before insert on coaches
  for each row
  execute function check_coach_seat_limit();

-- Reactivation only: fires strictly on a true->false transition, not
-- on archiving (new.archived = true) or on unrelated field edits to
-- an already-active coach -- `update of archived` alone would still
-- fire on those (it triggers whenever the column is touched in the
-- SET list, whether or not its value actually changes), hence the
-- extra `is distinct from` guard.
drop trigger if exists enforce_coach_seat_limit_reactivate on coaches;
create trigger enforce_coach_seat_limit_reactivate
  before update of archived on coaches
  for each row
  when (new.archived = false and old.archived is distinct from new.archived)
  execute function check_coach_seat_limit();

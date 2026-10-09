-- ============================================================
-- 0110_pb_types.sql
-- ============================================================
-- PB detection for a weighted exercise previously only recognised ONE
-- shape: heaviest single weight ever lifted (reps at that weight were
-- recorded alongside it, but never themselves compared) - reported
-- live: "well done/thumbs up message only works on increasing load,
-- not increasing reps or TTL [total training load / session volume]".
--
-- Adds two new PB "lanes" a weighted exercise can independently earn,
-- alongside the existing one:
--   - 'e1rm'   - best estimated 1RM across all done sets this session
--                (Epley: weight * (1 + reps/30)), so more reps at the
--                same (or even a bit less) weight can out-rank a PB
--                that was only ever measured by raw top weight.
--   - 'volume' - this session's total tonnage (sum of weight*reps
--                across every done set), independent of any single
--                set - a session of more total work can be a genuine
--                best even with no new heaviest single rep.
-- The existing shape is now explicitly labelled 'weight'; bodyweight
-- reps/time keep their existing behaviour, just labelled 'bw_reps'/
-- 'bw_time' for the same explicit-over-inferred reason.
--
-- "Reps at the athlete's best-ever weight" (matching or beating a
-- previous session's top weight with more reps than it recorded) does
-- NOT need its own lane/column - the existing weight-lane comparison
-- is extended app-side to break ties on reps, so a 100kg x5 PB upgrades
-- to 100kg x7 in place rather than requiring a heavier top weight.
--
-- A session can now legitimately hold more than one PB row per
-- exercise (e.g. a genuine new best weight AND a new best volume in
-- the same sitting) - the 0039 unique constraint is widened to
-- include pb_type so these coexist instead of overwriting each other.
-- ============================================================

alter table personal_bests
  add column if not exists pb_type text not null default 'weight';

alter table personal_bests
  add column if not exists e1rm_kg numeric;

alter table personal_bests
  add column if not exists volume_kg numeric;

update personal_bests set pb_type = case
  when time_seconds is not null then 'bw_time'
  when weight_kg is null and reps is not null then 'bw_reps'
  else 'weight'
end
where pb_type = 'weight'; -- only backfills rows still on the column default

alter table personal_bests
  drop constraint if exists personal_bests_pb_type_check;
alter table personal_bests
  add constraint personal_bests_pb_type_check
    check (pb_type in ('weight', 'e1rm', 'volume', 'bw_reps', 'bw_time'));

alter table personal_bests
  drop constraint if exists personal_bests_athlete_exercise_session_unique;
alter table personal_bests
  add constraint personal_bests_athlete_exercise_session_type_unique
  unique (athlete_id, exercise_name, session_id, pb_type);

comment on column personal_bests.pb_type is 'Which PB shape this row is: weight (heaviest single weight, the classic PB), e1rm (best estimated 1RM this session), volume (best total session tonnage), bw_reps (bodyweight, most reps), bw_time (bodyweight, longest hold). (0110)';
comment on column personal_bests.e1rm_kg is 'Estimated 1RM (Epley) for pb_type=''e1rm'' rows only; weight_kg/reps on the same row are the actual best set that produced it, kept for display. Null for every other pb_type. (0110)';
comment on column personal_bests.volume_kg is 'Total session tonnage (sum of weight*reps across all done sets) for pb_type=''volume'' rows only. Null for every other pb_type. (0110)';

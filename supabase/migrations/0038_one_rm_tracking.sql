-- ============================================================
-- 0038_one_rm_tracking.sql
-- ============================================================
-- Coach-set fixed 1RM values per athlete + exercise, used to turn a
-- prescribed "%1RM" into an actual kg target in the athlete app when
-- the org's `one_rm_source` setting is "fixed". When it's "rolling"
-- (the default), the target is estimated from the athlete's logged
-- history instead and this table isn't consulted.
--
-- Coach-side RLS only (join up to the org via the parent athlete —
-- same pattern as template_defs in 0003). Athletes never read or
-- write this table directly in v1: it's coach-set on the athlete's
-- profile, and the athlete app only ever sees the derived kg target,
-- computed server-side via the service-role client (which bypasses
-- RLS, with ownership checks in lib/data/athlete-share-link.ts).
-- ============================================================

create table athlete_one_rms (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  exercise_name text not null,
  one_rm_kg numeric(6,2) not null,
  updated_at timestamptz not null default now(),
  unique (athlete_id, exercise_name)
);

create index athlete_one_rms_athlete_id_idx on athlete_one_rms(athlete_id);

alter table athlete_one_rms enable row level security;

create policy "Coaches manage own org athlete one-rms" on athlete_one_rms
  for all using (
    exists (select 1 from athletes a where a.id = athlete_one_rms.athlete_id and a.organisation_id = my_organisation_id())
  ) with check (
    exists (select 1 from athletes a where a.id = athlete_one_rms.athlete_id and a.organisation_id = my_organisation_id())
  );

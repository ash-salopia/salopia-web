-- ============================================================
-- 0046_recovery_sessions.sql
-- ============================================================
-- New session type: Recovery. Deliberately follows the existing
-- hyrox_type/hyrox_config and cardio_type/cardio_config pattern
-- (one text "sub-type" column + one untyped jsonb payload column,
-- shaped only by client-side TypeScript) rather than the Power/Speed
-- approach of dedicated session_exercises columns + a manual adapter
-- layer — Recovery's block-based routine (instruction/exercise/timed/
-- checklist/media/feedback blocks, in any order, plus a separate
-- flat-checklist format) doesn't map cleanly onto one exercise-per-row
-- shape the way Power/Speed's uniform sets/reps data did.
--
-- recovery_config also carries athlete-side completion state (which
-- blocks/checklist items are done) inline, the same way
-- HyroxCircuitConfig already stores roundsDone/amrapResult alongside
-- its own prescription data — one column round-trips both.
--
-- Mirrored onto template_defs/programme_sessions since both snapshot
-- a session's full shape for later loading onto an athlete's calendar
-- (see loadTemplateForAthlete / loadProgrammeSessionForAthlete).
-- ============================================================

alter table sessions add column if not exists recovery_category text;
alter table sessions add column if not exists recovery_format text;
alter table sessions add column if not exists recovery_config jsonb not null default '{}';

alter table template_defs add column if not exists recovery_category text;
alter table template_defs add column if not exists recovery_format text;
alter table template_defs add column if not exists recovery_config jsonb not null default '{}';

alter table programme_sessions add column if not exists recovery_category text;
alter table programme_sessions add column if not exists recovery_format text;
alter table programme_sessions add column if not exists recovery_config jsonb not null default '{}';

-- ------------------------------------------------------------
-- sessions.type's check constraint isn't reliably reflected in the
-- migration history (0032's own comment notes sessions.type already
-- allowed 'power_speed' despite no tracked migration ever adding it —
-- it was evidently hand-patched live at some point). Look up and drop
-- whatever it's actually named today rather than guessing, then
-- replace it with a consistently-named one so future migrations can
-- target it reliably.
-- ------------------------------------------------------------
do $$
declare
  con record;
begin
  for con in
    select pgc.conname
    from pg_constraint pgc
    join pg_class rel on rel.oid = pgc.conrelid
    where rel.relname = 'sessions'
      and pgc.contype = 'c'
      and pg_get_constraintdef(pgc.oid) ilike '%strength%'
      and pg_get_constraintdef(pgc.oid) ilike '%hyrox%'
  loop
    execute format('alter table sessions drop constraint %I', con.conname);
  end loop;
end $$;

alter table sessions add constraint sessions_type_check
  check (type in ('strength', 'hyrox', 'cardio', 'power_speed', 'recovery'));

alter table template_defs drop constraint if exists template_defs_type_check;
alter table template_defs add constraint template_defs_type_check
  check (type in ('strength', 'hyrox', 'cardio', 'power_speed', 'recovery'));

alter table programme_sessions drop constraint if exists programme_sessions_type_check;
alter table programme_sessions add constraint programme_sessions_type_check
  check (type in ('strength', 'hyrox', 'cardio', 'power_speed', 'recovery'));

-- ------------------------------------------------------------
-- RECOVERY PRESETS
-- Org-scoped, reusable single-session snippets a coach can save from
-- any Recovery session and apply to a new one. Deliberately NOT built
-- on the templates/template_defs system — those always carry a
-- multi-day days[] wrapper Recovery presets don't need, and there's
-- no existing precedent for "save just one session as reusable"
-- (Session Library grants access to a whole multi-day template, a
-- different feature). config uses the exact same shape as
-- sessions.recovery_config, minus any completion-state fields
-- (stripped by the app before saving/applying, same as prescription
-- vs logged-result stay separate everywhere else in this codebase).
-- ------------------------------------------------------------
create table recovery_presets (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name            text not null,
  category        text,
  format          text not null check (format in ('quick', 'guided', 'checklist')),
  config          jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

create index recovery_presets_organisation_id_idx on recovery_presets(organisation_id);

alter table recovery_presets enable row level security;

create policy "Coaches manage own org recovery presets" on recovery_presets
  for all using (organisation_id = my_organisation_id())
  with check (organisation_id = my_organisation_id());

-- ------------------------------------------------------------
-- SESSION FEEDBACK
-- End-of-session athlete feedback, optionally requested per Recovery
-- session (recovery_config.request_feedback). Mirrors
-- weekly_reflections' shape/RLS style exactly, keyed by session_id
-- instead of (athlete_id, week_start) — one feedback row per session.
-- Athletes have no auth.uid() (share-token access only), so writes
-- go through the service-role client with a manual ownership check,
-- same as every other athlete-link write in this codebase; RLS here
-- only needs to cover the coach-facing read/manage path.
-- ------------------------------------------------------------
create table session_feedback (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references sessions(id) on delete cascade,
  athlete_id    uuid not null references athletes(id) on delete cascade,
  completion    boolean,
  recovery_score numeric,
  soreness      numeric,
  fatigue       numeric,
  pain_notes    text default '',
  notes         text default '',
  created_at    timestamptz not null default now(),
  unique(session_id)
);

create index session_feedback_athlete_id_idx on session_feedback(athlete_id);

alter table session_feedback enable row level security;

create policy "Coaches manage org session feedback" on session_feedback
  for all using (
    exists (
      select 1 from athletes a
      where a.id = session_feedback.athlete_id
        and a.organisation_id = my_organisation_id()
    )
  );

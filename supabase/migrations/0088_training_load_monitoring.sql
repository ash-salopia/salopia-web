-- 0088 — Training-load / return-to-play monitoring
--
-- Adds the schema for the training-load / RTP monitoring feature. Everything
-- is master-gated in organisations.settings (JSON — no migration needed for
-- the toggle itself). Uses `if [not] exists` / `drop constraint if exists`
-- throughout because the live `sessions` schema carries hand-applied drift
-- (rpe, rpe_logged_at, power_speed were never in a tracked migration).
--
-- Apply MANUALLY in the Supabase SQL editor.

-- 1. New 'sport' session type -----------------------------------------------
alter table sessions drop constraint if exists sessions_type_check;
alter table sessions add constraint sessions_type_check
  check (type in ('strength','hyrox','cardio','power_speed','recovery','sport'));

-- Future-proofing only — v1 does not build sport templates/programmes, but a
-- stray value shouldn't 500 the editors.
alter table template_defs drop constraint if exists template_defs_type_check;
alter table template_defs add constraint template_defs_type_check
  check (type in ('strength','hyrox','cardio','power_speed','recovery','sport'));

alter table programme_sessions drop constraint if exists programme_sessions_type_check;
alter table programme_sessions add constraint programme_sessions_type_check
  check (type in ('strength','hyrox','cardio','power_speed','recovery','sport'));

-- 2. Universal session duration (real minutes) + sport config --------------
alter table sessions add column if not exists duration_min smallint;
alter table sessions add column if not exists sport_config jsonb;

-- 3. Athlete-logged session source ----------------------------------------
-- 'athlete_logged' = an ad-hoc sport session the athlete added themselves.
-- Counts toward training load, but is NOT a coach-assigned programme session
-- (so it stays out of adherence/completion stats, which key on 'programme').
alter table sessions drop constraint if exists sessions_session_source_check;
alter table sessions add constraint sessions_session_source_check
  check (session_source in ('programme','library','athlete_logged'));

-- 4. Extended check-in fields --------------------------------------------
-- All nullable — only asked when the daily-wellness / pain tick-boxes are on.
alter table checkins add column if not exists fatigue        smallint;  -- 1-5
alter table checkins add column if not exists stress         smallint;  -- 1-5
alter table checkins add column if not exists pain_score     smallint;  -- 0-10
alter table checkins add column if not exists pain_location  text;
alter table checkins add column if not exists wellness_notes text;

alter table checkins drop constraint if exists checkins_fatigue_check;
alter table checkins add constraint checkins_fatigue_check
  check (fatigue is null or fatigue between 1 and 5);
alter table checkins drop constraint if exists checkins_stress_check;
alter table checkins add constraint checkins_stress_check
  check (stress is null or stress between 1 and 5);
alter table checkins drop constraint if exists checkins_pain_score_check;
alter table checkins add constraint checkins_pain_score_check
  check (pain_score is null or pain_score between 0 and 10);

-- 5. Return-to-play / availability status per athlete --------------------
alter table athletes add column if not exists rtp_status text not null default 'available';
alter table athletes add column if not exists rtp_note   text;
alter table athletes add column if not exists rtp_since  date;

alter table athletes drop constraint if exists athletes_rtp_status_check;
alter table athletes add constraint athletes_rtp_status_check
  check (rtp_status in ('available','modified','rehab','return_to_play','unavailable'));

-- 6. Index for the dashboard "Availability" panel -----------------------
create index if not exists idx_athletes_rtp_status
  on athletes(rtp_status) where rtp_status <> 'available';

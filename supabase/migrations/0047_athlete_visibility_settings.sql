-- ============================================================
-- 0047_athlete_visibility_settings.sql
-- ============================================================
-- Athlete-controlled privacy preferences for the shared Community
-- feed (PBs, comments/reactions, group chat, competitions) — set by
-- the athlete themselves via /a/[token]/settings, never by the coach.
--
-- Scope: these only affect what OTHER ATHLETES see. The coach's own
-- views (dashboard, coach Community tab) are unaffected — the coach
-- already sees full names and every PB everywhere else in the app as
-- the account owner managing the athlete's training, so filtering
-- those views would just hide real data from the person coaching them.
-- ============================================================

alter table athletes add column if not exists hide_pbs_from_feed boolean not null default false;
alter table athletes add column if not exists feed_first_name_only boolean not null default false;

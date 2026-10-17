-- ============================================================
-- 0120_session_comment_reactions.sql
-- ============================================================
-- 👍 / 👎 from a coach on an athlete's session comment
-- (sessions.athlete_notes, 0033) - a one-tap reply from the coach
-- Dashboard's "Session comments" panel or the athlete page's
-- Dashboard tab. Reacting also marks the comment as read
-- (athlete_notes_acknowledged, 0036). The athlete sees the reaction
-- under their comment in the app.
--
-- If the athlete later edits their comment, the reaction is cleared
-- (it was a reply to the old text) - see updateAthleteSessionNotes.
--
-- No new policies: coaches already update sessions via RLS, athletes
-- go through the service-role athlete-link routes.
-- ============================================================

alter table sessions
  add column if not exists athlete_notes_reaction text check (athlete_notes_reaction in ('up', 'down')),
  add column if not exists athlete_notes_reaction_by text,
  add column if not exists athlete_notes_reacted_at timestamptz;

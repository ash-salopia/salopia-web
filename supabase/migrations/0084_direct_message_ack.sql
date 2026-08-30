-- ============================================================
-- 0084_direct_message_ack.sql
-- ============================================================
-- Lets a coach dismiss an athlete message off the Dashboard's
-- "Athlete messages" panel, the same way session comments are
-- dismissed (sessions.athlete_notes_acknowledged, 0036).
--
-- Only athlete-sent rows are ever shown in that panel, so this
-- column is only meaningful on those. NULL = still showing;
-- a timestamp = a coach has cleared it. The panel filters these
-- out client-side, so the feature degrades gracefully if this
-- migration hasn't run yet (the column just reads as undefined).
-- ============================================================

alter table direct_messages add column if not exists acknowledged_at timestamptz;

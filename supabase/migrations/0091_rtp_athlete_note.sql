-- 0091 — athlete-facing return-to-play note (0088 follow-up)
--
-- rtp_note (0088) stays coach/physio-only. This is the separate "what you
-- can / can't do" message the athlete sees in their app (home-screen banner
-- + Settings) while their availability isn't "available".
--
-- Apply MANUALLY in the Supabase SQL editor.

alter table athletes add column if not exists rtp_athlete_note text;

-- Warm-up and cool-down content parsed from a PDF/notes programme
-- shouldn't become individual logged exercises (they clutter the
-- session with things nobody is tracking sets/reps history for) — they
-- collapse into free text instead. session_notes (0017) already renders
-- at the TOP of a session, so it doubles as the warm-up slot; this adds
-- the missing bottom-of-session counterpart for cool-down.
alter table sessions add column if not exists cooldown_notes text;

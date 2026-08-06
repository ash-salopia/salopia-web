-- ============================================================
-- 0048_library_entry_defaults.sql
-- Per-exercise defaults on a library entry for three flags that
-- previously had to be re-ticked by hand every time the exercise was
-- added to a session: bodyweight-only, logged per side, and %1RM
-- prescribing. Applied when the entry is picked from the library
-- (ExerciseCard.applyLibraryPreset) or matched during voice/notes
-- import (SessionReviewEditor.enrichWithLibrary).
-- ============================================================

alter table library_entries
  add column if not exists is_bodyweight boolean not null default false,
  add column if not exists each_side boolean not null default false,
  add column if not exists use_percent_1rm boolean not null default false;

comment on column library_entries.is_bodyweight is 'Default for session_exercises.is_bodyweight when this entry is loaded into a session (0048)';
comment on column library_entries.each_side is 'Default for session_exercises.each_side when this entry is loaded into a session (0048)';
comment on column library_entries.use_percent_1rm is 'Default for session_exercises.use_percent_1rm when this entry is loaded into a session (0048)';

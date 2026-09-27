-- ============================================================
-- 0105_warmup_notes_and_video_links.sql
-- Warm-up gets its own field, separate from the general
-- session_notes box - previously session_notes doubled as both
-- "general coaching notes" and "warm-up" (0017/0103), which worked
-- for the AI-parse flow but left no way to have both at once, and no
-- clear "Warm-up" label on a manually-built session. session_notes
-- reverts to its original general-notes purpose; warmup_notes is the
-- new dedicated warm-up slot, alongside the existing cooldown_notes.
--
-- Also adds an optional video link per note block (session notes,
-- warm-up, cool-down) - a coach can attach a demo/technique video
-- rather than only free text.
-- ============================================================

alter table sessions
  add column if not exists warmup_notes text,
  add column if not exists session_notes_video_url text,
  add column if not exists warmup_video_url text,
  add column if not exists cooldown_video_url text;

comment on column sessions.warmup_notes is 'Warm-up notes, shown near the top of the session - separate from the general session_notes box (0105)';
comment on column sessions.session_notes_video_url is 'Optional video link attached to the general Session Notes block (0105)';
comment on column sessions.warmup_video_url is 'Optional video link attached to the Warm-up notes block (0105)';
comment on column sessions.cooldown_video_url is 'Optional video link attached to the Cool-down notes block (0105)';

-- Session note templates get three more categories to match
-- (0104 added the "Load template" empty-state link; hyrox/sport/
-- recovery sessions previously had no category of their own to
-- filter by, so a template tagged for them could never show up
-- there specifically - only "general"/"warm_up" ones would).
alter table session_note_templates
  drop constraint if exists session_note_templates_category_check;

alter table session_note_templates
  add constraint session_note_templates_category_check
    check (category in ('general', 'warm_up', 'strength', 'power_speed', 'cardio', 'hyrox', 'sport', 'recovery'));

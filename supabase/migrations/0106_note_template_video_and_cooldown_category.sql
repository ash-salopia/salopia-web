-- ============================================================
-- 0106_note_template_video_and_cooldown_category.sql
-- Two gaps found testing 0105's template work:
--
--  * A note template had nowhere to store a video link, even though
--    the Session Notes/Warm-up/Cool-down blocks themselves can now
--    carry one (0105) - loading a template could never bring a video
--    along with it.
--  * "warm_up" was the only content-specific category on offer, so a
--    warm-up-tagged template also appeared in the general Session
--    Notes and Cool-down template pickers (there was no separate
--    "cool_down" category to distinguish it, and - see
--    SessionNotesBlock.tsx - the picker filtered by session type only,
--    not by which block was asking). Adding "cool_down" here is the
--    schema half of that fix; the filter logic fix is app-side.
-- ============================================================

alter table session_note_templates
  add column if not exists video_url text;

alter table session_note_templates
  drop constraint if exists session_note_templates_category_check;

alter table session_note_templates
  add constraint session_note_templates_category_check
    check (category in ('general', 'warm_up', 'cool_down', 'strength', 'power_speed', 'cardio', 'hyrox', 'sport', 'recovery'));

comment on column session_note_templates.video_url is 'Optional video link carried along when this template is loaded into a Session Notes/Warm-up/Cool-down block (0106)';

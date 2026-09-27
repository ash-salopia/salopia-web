-- ============================================================
-- 0107_note_template_multi_category_and_ps_reorder.sql
-- Note templates: single category -> multiple ("categories" tag array).
-- A note is often relevant to more than one session type (e.g. a
-- generic mobility warm-up fits Strength AND Power/Speed) - forcing
-- one category meant duplicating the template per type, or tagging it
-- "general" and losing the filtering entirely.
--
-- (This migration has no schema changes for Power/Speed exercise
-- reordering - that fix is app-side only, reusing the same
-- sort_order/handleReorderExercise the strength builder already had.)
-- ============================================================

alter table session_note_templates
  add column if not exists categories text[] not null default '{}';

update session_note_templates
  set categories = array[category]
  where categories = '{}' and category is not null;

alter table session_note_templates
  drop constraint if exists session_note_templates_category_check;

alter table session_note_templates
  add constraint session_note_templates_categories_check
    check (categories <@ array['general','warm_up','cool_down','strength','power_speed','cardio','hyrox','sport','recovery']::text[]);

alter table session_note_templates
  drop column if exists category;

comment on column session_note_templates.categories is 'Which Session Notes/Warm-up/Cool-down pickers this template shows up in - can be several (0107, replaces the single "category" column)';

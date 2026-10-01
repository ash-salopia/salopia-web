-- ============================================================
-- 0109_remove_general_note_category.sql
-- Note templates: drop the "general" (show-everywhere) category.
-- A template now always explicitly lists which Session Notes/
-- Warm-up/Cool-down pickers it should appear in, e.g. "Strength"
-- + "Power / Speed" rather than one catch-all option.
--
-- Any template currently tagged "general" is expanded to every
-- concrete category first, so it keeps showing up everywhere it
-- already did instead of silently disappearing from every picker.
-- ============================================================

alter table session_note_templates
  drop constraint if exists session_note_templates_categories_check;

update session_note_templates
set categories = (
  select array_agg(distinct cat)
  from unnest(
    case when 'general' = any(categories)
      then array['warm_up','cool_down','strength','power_speed','cardio','hyrox','sport','recovery']
      else categories
    end
  ) as cat
)
where 'general' = any(categories);

alter table session_note_templates
  add constraint session_note_templates_categories_check
    check (categories <@ array['warm_up','cool_down','strength','power_speed','cardio','hyrox','sport','recovery']::text[]);

comment on column session_note_templates.categories is 'Which Session Notes/Warm-up/Cool-down pickers this template shows up in (0109: "general" removed - a template now always explicitly lists where it appears; old "general" templates were expanded to every category to preserve their previous "shows everywhere" behaviour).';

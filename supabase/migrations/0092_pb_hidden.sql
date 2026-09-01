-- 0092 — coach-hidden personal bests
--
-- A PB shown on the athlete profile can come from two places: a stored
-- personal_bests row, OR a value re-derived on the fly from a logged
-- session's set data (the fallback scan for coach-logged / Live Group
-- sessions). Deleting the stored row doesn't remove the second kind — it
-- just re-derives next load. This list lets a coach hide a fluke/mis-logged
-- PB regardless of where it came from; adding a manual PB for that exercise
-- un-hides it.
--
-- Lower-cased exercise names. Apply MANUALLY in the Supabase SQL editor.

alter table athletes add column if not exists pb_hidden text[] not null default '{}';

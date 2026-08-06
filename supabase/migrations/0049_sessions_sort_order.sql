-- ============================================================
-- 0049_sessions_sort_order.sql
-- Documents sessions.sort_order, which already exists in production
-- (added directly via the SQL editor at some point, with no
-- corresponding migration file — this backfills that gap so a fresh
-- database created from migrations alone has it too). Controls
-- ordering among multiple sessions on the same day: written by
-- reorderSessionsOnDay() (lib/data/sessions.ts) when a coach drags to
-- reorder, read by the coach's athlete page. The athlete-facing app
-- previously ignored this column entirely, so same-day sessions could
-- render in a different order there than on the coach side.
-- ============================================================

alter table sessions
  add column if not exists sort_order integer not null default 0;

comment on column sessions.sort_order is 'Position among sessions on the same day, set by the coach dragging to reorder (0049 — column pre-existed, this documents it)';

-- ============================================================
-- 0009_live_group.sql
-- ============================================================
-- Adds "Live group" membership — a coach can star a subset of
-- athletes (e.g. everyone training together right now) to see them
-- side by side in a compact multi-athlete view, with tappable set
-- completion, rather than switching between individual athlete pages
-- one at a time during a group session.
--
-- A simple boolean on the athlete row, rather than a separate join
-- table or an array stored elsewhere — there's only ever one live
-- group per organisation at a time (matching the prototype's
-- behaviour, where this was a single shared array), so this is the
-- simplest representation that still lets every coach in the
-- organisation see the same live group.
-- ============================================================

alter table athletes add column in_live_group boolean not null default false;

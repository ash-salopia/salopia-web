-- ============================================================
-- 0132_programme_weeks.sql
-- ============================================================
-- Programme builder (week x Mon-Sun grid). A programme can now have a
-- set length in weeks, including empty weeks at the end that no
-- session sits in yet.
--
-- For a programme with weeks set, programme_sessions.day_offset is
-- (week - 1) * 7 + weekday, with 0 = Monday of week 1 - so loading it
-- onto an athlete from a Monday puts every session on its own weekday.
-- Programmes saved before this (weeks null) keep the old meaning: day
-- numbers relative to their first session.
-- ============================================================

alter table programmes
  add column if not exists weeks int check (weeks between 1 and 104);

-- ============================================================
-- 0063_morning_reminder.sql
-- ============================================================
-- Morning "you have a session today" push, athlete-configurable
-- delivery time (native <input type="time"> in the UI - a scrollable
-- wheel on mobile, no custom picker needed). Separate from the
-- existing evening "haven't started / haven't rated" reminder
-- (0062's notify_missed_session/notify_rpe_reminder) - this one fires
-- once in the morning regardless of whether they've trained yet, that
-- one only fires in the evening if they still haven't.
--
-- morning_reminder_time has no timezone awareness - there's no
-- per-athlete or per-org timezone field anywhere in this schema yet,
-- same simplification the existing evening cron already makes (it
-- just uses server/UTC "today"). Treated as UTC ~= the coach's local
-- time (vercel.json's dub1 region implies UK/Ireland) until a real
-- timezone field exists.
--
-- Also: feed_first_name_only (0047) now defaults true for NEWLY
-- created athletes only - existing athletes keep whatever value
-- they're already on. Changing an existing athlete's actual privacy
-- preference is a real behaviour change for a real person, not
-- something a schema migration should silently do.
-- ============================================================

alter table athletes add column if not exists notify_morning_reminder boolean not null default true;
alter table athletes add column if not exists morning_reminder_time time not null default '07:00:00';

alter table athletes alter column feed_first_name_only set default true;

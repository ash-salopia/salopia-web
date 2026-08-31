-- 0089 — per-athlete "monitor wellness anyway" override (0088 follow-up)
--
-- The pain / wellness check-in questions from 0088 are normally only asked of
-- athletes whose rtp_status <> 'available'. This flag forces them on for one
-- athlete regardless — for a cleared athlete you still want to keep an eye on
-- (chronic niggle, heavy competition block).
--
-- Apply MANUALLY in the Supabase SQL editor.

alter table athletes add column if not exists monitor_wellness boolean not null default false;

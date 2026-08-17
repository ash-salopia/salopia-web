-- ============================================================
-- 0062_notification_preferences.sql
-- ============================================================
-- Per-notification-type opt-out, separate from the push subscription
-- itself (0061) — a coach/athlete can be subscribed to push overall
-- but turn off one specific kind of alert, rather than all-or-nothing.
-- Same "plain boolean column on the owning row" pattern as athletes'
-- existing hide_pbs_from_feed/feed_first_name_only (0047), not a new
-- preferences table, since these are simple per-row flags read/written
-- as individual columns, not as one JSONB unit.
-- Default true (opt-out, not opt-in) since turning this off is only
-- reachable after already opting into push in the first place.
-- ============================================================

alter table coaches add column if not exists notify_pb boolean not null default true;

alter table athletes add column if not exists notify_missed_session boolean not null default true;
alter table athletes add column if not exists notify_rpe_reminder boolean not null default true;

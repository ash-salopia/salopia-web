-- ============================================================
-- 0083_message_edited_at.sql
-- ============================================================
-- Adds edit + delete to chat (group chat 0011, direct messages 0077).
--
-- Delete is a hard delete — no schema change needed, the existing
-- "for all" RLS policies on both tables already permit a coach to
-- DELETE rows scoped to their organisation.
--
-- Edit rewrites `body` in place; this column just records when, so
-- the UI can show an "edited" marker. The "for all" RLS policies
-- already permit the UPDATE too.
--
-- The UI only exposes edit/delete on the coach's OWN messages
-- (sender_id = the coach). RLS is left as the broader org-scoped
-- "for all" — consistent with the rest of the app, where coaches
-- trust each other with org-wide data — rather than adding a
-- per-sender restriction here.
--
-- Both tables are already in the supabase_realtime publication, so
-- UPDATE/DELETE events flow to open clients with no extra step.
-- (DELETE events only carry the primary key under the default
-- replica identity — the client matches them by id, so that's fine
-- and REPLICA IDENTITY FULL is not required.)
-- ============================================================

alter table group_messages  add column if not exists edited_at timestamptz;
alter table direct_messages add column if not exists edited_at timestamptz;

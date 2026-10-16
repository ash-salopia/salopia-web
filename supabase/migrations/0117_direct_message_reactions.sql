-- ============================================================
-- 0117_direct_message_reactions.sql
-- ============================================================
-- 👍 / 👎 quick replies on 1:1 coach<->athlete messages (0077), so a
-- message like "can I switch today's session to tomorrow?" can be
-- answered with one tap instead of a typed reply.
--
-- One reaction per message, set by the OTHER side of the thread
-- (a coach reacts to athlete messages, the athlete reacts to coach
-- messages). reaction_by_name is who tapped it, shown on the bubble.
-- Tapping the same thumb again clears it (all three back to null).
--
-- No new policies needed: the coach-side "for all" RLS policy on
-- direct_messages already allows the UPDATE, and the athlete side
-- goes through the service-role /api/athlete-link/direct-messages
-- route, which checks the message belongs to that athlete.
-- ============================================================

alter table direct_messages
  add column if not exists reaction text check (reaction in ('up', 'down')),
  add column if not exists reaction_by_name text,
  add column if not exists reacted_at timestamptz;

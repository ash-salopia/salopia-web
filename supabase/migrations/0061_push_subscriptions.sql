-- ============================================================
-- 0061_push_subscriptions.sql
-- ============================================================
-- Web Push subscriptions (VAPID) for both surfaces of the app:
--  - coach_id: a coach on the /(coach)/... dashboard (real Supabase
--    Auth session, subscribes via /api/push/subscribe).
--  - athlete_id: an athlete on the /a/[token]/... share-link app (no
--    auth session at all - subscribes via
--    /api/athlete-link/push-subscribe, resolved from their share
--    token exactly like every other athlete-link write).
-- Exactly one of the two is set, matching subscriber_type - enforced
-- by the check constraint below rather than trusting the caller.
--
-- One row per browser/device (endpoint is the browser-assigned push
-- URL, effectively a device id) - a coach or athlete can be subscribed
-- on more than one device at once, each gets its own row.
-- ============================================================

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  subscriber_type text not null check (subscriber_type in ('coach', 'athlete')),
  coach_id uuid references coaches(id) on delete cascade,
  athlete_id uuid references athletes(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  check (
    (subscriber_type = 'coach' and coach_id is not null and athlete_id is null)
    or
    (subscriber_type = 'athlete' and athlete_id is not null and coach_id is null)
  )
);

create index push_subscriptions_coach_id_idx on push_subscriptions(coach_id) where coach_id is not null;
create index push_subscriptions_athlete_id_idx on push_subscriptions(athlete_id) where athlete_id is not null;

alter table push_subscriptions enable row level security;

-- Athlete-side rows only ever get written via the service-role client
-- (see /api/athlete-link/push-subscribe), which bypasses RLS entirely
-- — no policy needed for athlete_id rows, same as every other
-- athlete-link write path (CLAUDE.md's architecture note on this).
create policy "Coaches manage their own push subscriptions" on push_subscriptions
  for all using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- ============================================================
-- 0058_home_programmes.sql
-- ============================================================
-- Lets a coach publish an existing template as a public, no-login
-- "home programme" link — for younger squads doing home workouts
-- where there's no individual athlete profile to attach a session to.
-- Read-only on the public side: no completion tracking, no identity,
-- just "here are today's session options" (a template's defs already
-- give the "pick one of several sessions" range).
--
-- share_code is null = not published (default/existing behaviour,
-- unaffected). Setting it publishes the template at /g/<code>; NULLing
-- it again revokes access instantly. Deliberately NOT a foreign-keyed
-- separate table — the public route reads directly off `templates`,
-- same object the coach already edits, so there's only one place a
-- coach's edits can go stale.
--
-- share_expires_at is an optional coach-set cutoff (e.g. "this closes
-- in 6 weeks"), independent of and in addition to the org's Stripe
-- subscription status (checked at request time in the route itself via
-- lib/billing/access.ts's isReadOnlyRestricted — not stored here, so it
-- always reflects the coach's CURRENT billing state, not a snapshot).
-- ============================================================

alter table templates add column if not exists share_code text unique;
alter table templates add column if not exists share_expires_at timestamptz;

comment on column templates.share_code is 'Public /g/<code> link identifier. Null = not published as a home programme.';
comment on column templates.share_expires_at is 'Optional coach-set expiry for the public link. Null = no fixed expiry (still subject to the org''s subscription status, checked live).';

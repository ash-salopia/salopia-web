-- ============================================================
-- 0052_stripe_billing.sql
-- ============================================================
-- Wires the seat-licensing groundwork from 0030_seat_licensing.sql to
-- real billing via Stripe. Purely additive/nullable -- every existing
-- organisation stays exactly as it is today (plan = 'trial',
-- seat_limit = NULL, no subscription_status) until it actually
-- checks out through Stripe. That trial state IS the "no card
-- required, unrestricted" product decision, not a placeholder to
-- migrate away from.
--
-- `plan` and `seat_limit` (already existing) remain the source of
-- truth for tier name and athlete cap -- the Stripe webhook handler
-- (app/api/webhooks/stripe/route.ts) updates them on checkout/plan
-- change, same fields check_seat_limit() already reads. This
-- migration only adds the columns needed to track the Stripe side of
-- that relationship and the payment-failure grace period.
-- ============================================================

alter table organisations add column if not exists stripe_customer_id text;
alter table organisations add column if not exists stripe_subscription_id text;

-- null while on the free trial (no Stripe subscription exists yet).
-- 'active' | 'past_due' | 'canceled' once a subscription exists.
alter table organisations add column if not exists subscription_status text;

-- Set the moment a payment first fails (invoice.payment_failed) while
-- previously active; cleared on the next successful payment. Read-only
-- access enforcement (lib/data/billing.ts's isReadOnlyRestricted) uses
-- this to implement the 7-day grace period, independent of exactly
-- when Stripe's own Smart Retries schedule gives up.
alter table organisations add column if not exists past_due_since timestamptz;

-- 'month' | 'year'. Null while on trial / no subscription.
alter table organisations add column if not exists billing_interval text;

create index if not exists organisations_stripe_customer_id_idx
  on organisations(stripe_customer_id);

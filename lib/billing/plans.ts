// Fixed subscription tiers. This is the ONE place to edit when adding,
// renaming, or repricing a tier. The actual £ amounts are never stored
// here or anywhere in code -- they live entirely in the Stripe Dashboard
// as Product/Price objects. This file just maps a tier id to its Stripe
// Price IDs (via env vars) and the athlete seat limit it grants, which
// is what check_seat_limit() (0030_seat_licensing.sql) actually enforces.
//
// Prices below are placeholders set directly in the Stripe Dashboard --
// repricing later means creating a new Stripe Price and swapping the env
// var, not editing this file.

export type BillingInterval = "month" | "year";

export interface PlanTier {
  id: string;
  name: string;
  seatLimit: number | null; // null = unlimited
  priceIds: Record<BillingInterval, string | undefined>;
}

export const PLAN_TIERS: PlanTier[] = [
  {
    id: "starter",
    name: "Starter",
    seatLimit: 15,
    priceIds: {
      month: process.env.STRIPE_PRICE_STARTER_MONTHLY,
      year: process.env.STRIPE_PRICE_STARTER_YEARLY,
    },
  },
  {
    id: "pro",
    name: "Pro",
    seatLimit: 40,
    priceIds: {
      month: process.env.STRIPE_PRICE_PRO_MONTHLY,
      year: process.env.STRIPE_PRICE_PRO_YEARLY,
    },
  },
  {
    id: "unlimited",
    name: "Unlimited",
    seatLimit: null,
    priceIds: {
      month: process.env.STRIPE_PRICE_UNLIMITED_MONTHLY,
      year: process.env.STRIPE_PRICE_UNLIMITED_YEARLY,
    },
  },
];

export function getPlanTier(tierId: string): PlanTier | undefined {
  return PLAN_TIERS.find((t) => t.id === tierId);
}

export function getTierByPriceId(priceId: string): PlanTier | undefined {
  return PLAN_TIERS.find(
    (t) => t.priceIds.month === priceId || t.priceIds.year === priceId
  );
}

export function getIntervalByPriceId(
  priceId: string
): BillingInterval | undefined {
  const tier = getTierByPriceId(priceId);
  if (!tier) return undefined;
  if (tier.priceIds.month === priceId) return "month";
  if (tier.priceIds.year === priceId) return "year";
  return undefined;
}

// Live Group limits per subscription plan: how many athletes can be in
// the Live Group, and how many devices can control Live Group at once.
// Pure and dependency-free (same as lib/billing/entitlements.ts) so it
// can be imported from client pages and API routes alike.
//
// THIS IS THE ONE PLACE TO CHANGE THE NUMBERS. null = unlimited.
//
// Device limits are always per subscription (counted across the whole
// organisation, whichever coach or device), never per coach.
//
// Plan ids: the new tier names, plus the legacy ids lib/billing/plans.ts
// still uses with Stripe, mapped to their nearest equivalent. "trial" and
// any unknown/legacy plan string get full access, never lock an existing
// org out of something it could do yesterday.

export type LiveGroupTier = "student" | "coach" | "squad" | "performance" | "organisation" | "network";

interface TierLimits {
  name: string;
  maxAthletes: number | null;
  maxDevices: number | null;
}

const TIERS: Record<LiveGroupTier, TierLimits> = {
  student:      { name: "Student",      maxAthletes: 6,    maxDevices: 1 },
  coach:        { name: "Coach",        maxAthletes: 6,    maxDevices: 1 },
  squad:        { name: "Squad",        maxAthletes: null, maxDevices: 2 },
  // "Unlimited" devices from Performance up, but with a high safety cap
  // against runaway/abandoned devices (Ash's decision, 2026-10-13).
  performance:  { name: "Performance",  maxAthletes: null, maxDevices: 10 },
  organisation: { name: "Organisation", maxAthletes: null, maxDevices: 10 },
  network:      { name: "Network",      maxAthletes: null, maxDevices: 10 },
};

// Legacy Stripe plan ids (lib/billing/plans.ts) -> nearest new tier.
const LEGACY: Record<string, LiveGroupTier> = {
  starter: "coach",
  pro: "squad",
  unlimited: "performance",
};

export interface LiveGroupLimits {
  // null on trial / unknown plans (full access, no upsell shown).
  tier: LiveGroupTier | null;
  planName: string | null;
  maxAthletes: number | null;
  maxDevices: number | null;
}

export function liveGroupLimits(plan?: string | null): LiveGroupLimits {
  const key = (plan ?? "trial").trim().toLowerCase();
  const tier: LiveGroupTier | null =
    key in TIERS ? (key as LiveGroupTier) : LEGACY[key] ?? null;
  if (!tier) return { tier: null, planName: null, maxAthletes: null, maxDevices: null };
  const t = TIERS[tier];
  return { tier, planName: t.name, maxAthletes: t.maxAthletes, maxDevices: t.maxDevices };
}

// Where every Live Group "Upgrade" button points.
export const UPGRADE_HREF = "/settings#billing";

// Shown when adding an athlete would go over the cap.
export function athleteCapMessage(limits: LiveGroupLimits): string {
  return `Live Group holds up to ${limits.maxAthletes} athletes on the ${limits.planName} plan. Upgrade to Squad for unlimited athletes.`;
}

// Upsell under the take-over modal / view-only banner. null = show none
// (Performance and above, and trial).
export function deviceUpsellMessage(limits: LiveGroupLimits): string | null {
  if (limits.tier === "student" || limits.tier === "coach") {
    return "Upgrade to Squad to run Live Group on 2 devices at the same time, or Performance for 3+.";
  }
  if (limits.tier === "squad") {
    return "Upgrade to Performance to run Live Group on 3+ devices at the same time.";
  }
  return null;
}

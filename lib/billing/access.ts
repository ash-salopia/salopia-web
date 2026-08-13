// Pure, dependency-free so it can be imported from both the Edge
// runtime (middleware.ts) and normal client/server code without
// dragging in the Supabase client itself.

export const GRACE_PERIOD_DAYS = 7;

export interface OrganisationBillingState {
  subscription_status: string | null;
  past_due_since: string | null;
}

// Read-only kicks in once a payment has been failing for longer than
// the grace period, or the subscription has been outright canceled.
// A brand-new/trial organisation (subscription_status null) is never
// restricted -- that's the "no card required, unrestricted" trial.
export function isReadOnlyRestricted(org: OrganisationBillingState): boolean {
  if (org.subscription_status === "canceled") return true;
  if (org.subscription_status === "past_due" && org.past_due_since) {
    const pastDueSince = new Date(org.past_due_since).getTime();
    const graceMs = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
    return Date.now() - pastDueSince >= graceMs;
  }
  return false;
}

// For the settings-page banner: how many days remain in the grace
// period, or null if not applicable (not past_due, or already expired).
export function graceDaysRemaining(
  org: OrganisationBillingState
): number | null {
  if (org.subscription_status !== "past_due" || !org.past_due_since) return null;
  const pastDueSince = new Date(org.past_due_since).getTime();
  const graceMs = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
  const remainingMs = pastDueSince + graceMs - Date.now();
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
}

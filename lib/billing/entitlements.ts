// Which report capabilities a subscription plan unlocks. Pure and
// dependency-free (same as lib/billing/access.ts) so it can be imported
// anywhere without dragging in the Supabase client.
//
// Plan ids come from lib/billing/plans.ts (starter / pro / unlimited) +
// the default "trial". trial = full access on purpose: a trialling org
// should see everything the product can do. Any unknown/legacy plan
// string also falls back to full access — never lock an existing org
// out of something it could do yesterday.
//
// NOTE: enforcement is UI-only. Every report in this app is generated
// client-side (HTML window.print() or @react-pdf/renderer in the
// browser), and the underlying test_results are already RLS-readable by
// the coach — there's no server render path to gate. Same shape as the
// white-label branding gate in components/BrandingSettings.tsx.

export type ReportCapability = "athlete_reports" | "squad_summary" | "batch_reports";

const FULL: ReportCapability[] = ["athlete_reports", "squad_summary", "batch_reports"];

const PLAN_CAPS: Record<string, ReportCapability[]> = {
  trial: FULL,
  starter: ["athlete_reports"],
  pro: ["athlete_reports", "squad_summary"],
  unlimited: FULL,
};

export function planReportCapabilities(plan?: string | null): Set<ReportCapability> {
  return new Set(PLAN_CAPS[plan ?? "trial"] ?? FULL);
}

// Shown next to a locked menu item ("🔒 Pro").
export const CAPABILITY_MIN_PLAN: Record<ReportCapability, string> = {
  athlete_reports: "Starter",
  squad_summary: "Pro",
  batch_reports: "Unlimited",
};

"use client";

// ============================================================
// BillingSettings
// Embedded in the Settings page, org-level like TeamSettings /
// BrandingSettings.
//
// PREVIEW MODE: VIS BUILD is free while in preview and pricing / plan
// features aren't finalised, so the plan picker and Subscribe flow are
// hidden — coaches just see a "free preview" note. The past-due /
// cancelled banners and the Stripe portal link stay wired for the rare
// case an org already has a live subscription. Restore the plan grid
// (git history) once pricing is confirmed.
// ============================================================

import { useState, useEffect } from "react";
import { getOrganisationBilling, type OrganisationBilling } from "@/lib/data/billing";
import { graceDaysRemaining } from "@/lib/billing/access";
import CollapsibleSection from "@/components/CollapsibleSection";

interface Props {
  orgId: string;
  role: "owner" | "coach";
}

export default function BillingSettings({ orgId, role }: Props) {
  const [billing, setBilling] = useState<OrganisationBilling | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [error, setError] = useState("");

  const isOwner = role === "owner";

  useEffect(() => {
    if (!orgId) return;
    getOrganisationBilling()
      .then(setBilling)
      .catch(() => setError("Could not load billing details"))
      .finally(() => setLoading(false));
  }, [orgId]);

  async function handleManageBilling() {
    setError("");
    setOpeningPortal(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not open billing portal");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open billing portal");
      setOpeningPortal(false);
    }
  }

  if (loading || !billing) return null;

  const hasSubscription = billing.subscription_status != null;
  const daysLeft = graceDaysRemaining(billing);
  const activeSub = hasSubscription && billing.subscription_status !== "canceled";

  return (
    <CollapsibleSection
      title="💳 Billing"
      subtitle="Free while VIS BUILD is in preview"
      headerRight={<span style={{ ...s.badge, ...s.badgeTrial }}>Preview</span>}
    >
      {error && <div style={s.error}>{error}</div>}

      {billing.subscription_status === "past_due" && (
        <div style={s.pastDueBanner}>
          Your last payment failed. {daysLeft != null && daysLeft > 0
            ? `You have ${daysLeft} day${daysLeft === 1 ? "" : "s"} to update your card before the account becomes read-only.`
            : "Your account is now read-only until payment is resolved."}
          {isOwner && (
            <button style={s.linkBtn} onClick={handleManageBilling} disabled={openingPortal}>
              Update payment details →
            </button>
          )}
        </div>
      )}

      {billing.subscription_status === "canceled" && (
        <div style={s.pastDueBanner}>
          Your subscription is cancelled and the account is read-only. Contact support to restore full access.
        </div>
      )}

      {activeSub ? (
        <>
          <p style={s.previewText}>You have an active subscription.</p>
          {isOwner && (
            <button style={s.manageBtn} onClick={handleManageBilling} disabled={openingPortal}>
              {openingPortal ? "Opening…" : "Manage billing"}
            </button>
          )}
        </>
      ) : (
        <div style={s.previewBox}>
          <p style={s.previewText}>
            <strong>VIS BUILD is free while in preview.</strong> Every feature is unlocked, there&rsquo;s no
            athlete limit, and no card is needed.
          </p>
          <p style={s.previewText}>
            Paid plans and pricing will be announced before they start — you&rsquo;ll get plenty of notice,
            and nothing changes for you until then.
          </p>
        </div>
      )}

      {!isOwner && (
        <div style={s.readOnlyNote}>Only the organisation owner manages billing.</div>
      )}
    </CollapsibleSection>
  );
}

const s: Record<string, React.CSSProperties> = {
  badge: { borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700, flexShrink: 0 },
  badgeTrial: { background: "var(--ink)", color: "var(--mute)", border: "1px solid var(--line)" },
  error: { background: "#2a0c0c", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12 },
  pastDueBanner: { background: "#2a1e00", border: "1px solid #F59E0B44", color: "#F59E0B", borderRadius: 8, padding: "10px 12px", fontSize: 13, lineHeight: 1.5, marginBottom: 16, display: "flex", flexDirection: "column" as const, alignItems: "flex-start", gap: 6 },
  previewBox: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px" },
  previewText: { fontSize: 13, color: "var(--mute)", lineHeight: 1.6, margin: "0 0 8px" },
  readOnlyNote: { fontSize: 12, color: "var(--mute)", marginTop: 8 },
  linkBtn: { background: "transparent", border: "none", color: "#F59E0B", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0, textDecoration: "underline" },
  manageBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
};

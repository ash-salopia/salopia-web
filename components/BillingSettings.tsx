"use client";

// ============================================================
// BillingSettings
// Embedded in the Settings page, org-level like TeamSettings /
// BrandingSettings. Owners can subscribe/change plan/manage billing;
// non-owners see a read-only summary of the current plan.
// ============================================================

import { useState, useEffect } from "react";
import { getOrganisationBilling, type OrganisationBilling } from "@/lib/data/billing";
import { PLAN_TIERS } from "@/lib/billing/plans";
import { graceDaysRemaining } from "@/lib/billing/access";
import type { BillingInterval } from "@/lib/billing/plans";
import CollapsibleSection from "@/components/CollapsibleSection";

interface Props {
  orgId: string;
  role: "owner" | "coach";
}

export default function BillingSettings({ orgId, role }: Props) {
  const [billing, setBilling] = useState<OrganisationBilling | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("month");
  const [pendingTier, setPendingTier] = useState<string | null>(null);
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

  async function handleSubscribe(tierId: string) {
    setError("");
    setPendingTier(tierId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tierId, interval: billingInterval }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start checkout");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start checkout");
      setPendingTier(null);
    }
  }

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
  const currentTier = PLAN_TIERS.find((t) => t.id === billing.plan);
  const daysLeft = graceDaysRemaining(billing);

  const statusLabel = !hasSubscription
    ? "Trial"
    : billing.subscription_status === "active"
    ? "Active"
    : billing.subscription_status === "past_due"
    ? "Payment failed"
    : "Cancelled";
  const statusStyle = !hasSubscription
    ? s.badgeTrial
    : billing.subscription_status === "active"
    ? s.badgeActive
    : s.badgePastDue;

  return (
    <CollapsibleSection
      title="💳 Billing"
      subtitle={
        <>
          {currentTier ? currentTier.name : "Free trial"} plan
          {billing.seat_limit != null ? ` · up to ${billing.seat_limit} athletes` : " · unlimited athletes"}
        </>
      }
      headerRight={<span style={{ ...s.badge, ...statusStyle }}>{statusLabel}</span>}
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
          Your subscription is cancelled and the account is read-only.
          {isOwner && " Resubscribe below to restore full access."}
        </div>
      )}

      {!isOwner && (
        <div style={s.readOnlyNote}>Only the organisation owner can change billing.</div>
      )}

      {isOwner && hasSubscription && billing.subscription_status !== "canceled" && (
        <button style={s.manageBtn} onClick={handleManageBilling} disabled={openingPortal}>
          {openingPortal ? "Opening…" : "Manage billing"}
        </button>
      )}

      {isOwner && (!hasSubscription || billing.subscription_status === "canceled") && (
        <>
          <div style={s.intervalToggle}>
            <button
              style={{ ...s.intervalBtn, ...(billingInterval === "month" ? s.intervalBtnActive : {}) }}
              onClick={() => setBillingInterval("month")}
            >
              Monthly
            </button>
            <button
              style={{ ...s.intervalBtn, ...(billingInterval === "year" ? s.intervalBtnActive : {}) }}
              onClick={() => setBillingInterval("year")}
            >
              Annual
            </button>
          </div>

          <div style={s.tierGrid}>
            {PLAN_TIERS.map((tier) => (
              <div key={tier.id} style={s.tierCard}>
                <div style={s.tierName}>{tier.name}</div>
                <div style={s.tierSeats}>
                  {tier.seatLimit != null ? `Up to ${tier.seatLimit} athletes` : "Unlimited athletes"}
                </div>
                <button
                  style={{ ...s.subscribeBtn, opacity: pendingTier ? 0.6 : 1 }}
                  disabled={pendingTier != null}
                  onClick={() => handleSubscribe(tier.id)}
                >
                  {pendingTier === tier.id ? "Redirecting…" : "Subscribe"}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </CollapsibleSection>
  );
}

const s: Record<string, React.CSSProperties> = {
  badge: { borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700, flexShrink: 0 },
  badgeTrial: { background: "var(--ink)", color: "var(--mute)", border: "1px solid var(--line)" },
  badgeActive: { background: "#0a2218", color: "#10B981" },
  badgePastDue: { background: "#2a1e00", color: "#F59E0B" },
  error: { background: "#2a0c0c", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12 },
  pastDueBanner: { background: "#2a1e00", border: "1px solid #F59E0B44", color: "#F59E0B", borderRadius: 8, padding: "10px 12px", fontSize: 13, lineHeight: 1.5, marginBottom: 16, display: "flex", flexDirection: "column" as const, alignItems: "flex-start", gap: 6 },
  readOnlyNote: { fontSize: 12, color: "var(--mute)", marginBottom: 8 },
  linkBtn: { background: "transparent", border: "none", color: "#F59E0B", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0, textDecoration: "underline" },
  manageBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  intervalToggle: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14, maxWidth: 280 },
  intervalBtn: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  intervalBtnActive: { background: "var(--accent-dim)", borderColor: "var(--accent)", color: "var(--accent)" },
  tierGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 },
  tierCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column" as const, gap: 8 },
  tierName: { fontSize: 15, fontWeight: 700, color: "var(--text)" },
  tierSeats: { fontSize: 12, color: "var(--mute)" },
  subscribeBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginTop: 4 },
};

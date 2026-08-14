"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import type { ResolvedBranding } from "@/types/branding";
import { DEFAULT_BRANDING } from "@/types/branding";
import Avatar from "@/components/Avatar";
import { useIsMobile } from "@/lib/use-is-mobile";

const NAV_ITEMS = [
  { href: "/athletes",    label: "Athletes",    icon: "👤" },
  { href: "/live",        label: "Live group",  icon: "⭐" },
  { href: "/community",   label: "Community",   icon: "💬" },
  { href: "/documents",   label: "Documents",   icon: "📁" },
  { href: "/testing",     label: "Testing",     icon: "🧪" },
  { href: "/templates",   label: "Templates",   icon: "▦"  },
  { href: "/programmes",  label: "Programmes",  icon: "🗂"  },
  { href: "/library",     label: "Library",     icon: "📚" },
  { href: "/reporting",   label: "Reporting",   icon: "📊" },
  { href: "/dashboard",   label: "Dashboard",   icon: "📋" },
  { href: "/settings",    label: "Settings",    icon: "⚙️" },
];

type BillingBanner =
  | { type: "past_due"; daysLeft: number | null }
  | { type: "canceled" }
  | null;

export default function CoachShell({
  coachName,
  coachAvatarUrl = null,
  orgName,
  branding = DEFAULT_BRANDING,
  billingBanner = null,
  children,
}: {
  coachName: string;
  coachAvatarUrl?: string | null;
  orgName: string;
  branding?: ResolvedBranding;
  billingBanner?: BillingBanner;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", branding.primaryColor);
    root.style.setProperty("--accent-dim", branding.primaryColorDim);
  }, [branding.primaryColor, branding.primaryColorDim]);

  // Below this breakpoint the sidebar becomes an off-canvas drawer
  // (hidden by default, toggled via the header hamburger) rather than
  // an always-visible 220px column eating a third of a phone screen.
  // Desktop behaviour is untouched — isMobile is false until proven
  // otherwise, matching the pre-existing always-visible sidebar.
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Closing on navigation means the drawer never lingers open over the
  // next page — matches how a mobile nav drawer is expected to behave
  // (unlike the notes/voice review modals, there's no edit-in-progress
  // to protect here, so closing on an outside interaction is fine).
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  // Inject branding CSS variables
  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {isMobile && (
            <button
              style={styles.hamburgerBtn}
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="Toggle navigation"
            >
              ☰
            </button>
          )}
          {/* Logo / brand name */}
          <div style={styles.brand}>
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt={branding.displayName} style={styles.logo} />
            ) : (
              <span style={{ color: "var(--accent)" }}>{branding.displayName}</span>
            )}
            {branding.showOrgName && orgName && !isMobile && (
              <span style={styles.orgSeparator}>· {orgName}</span>
            )}
          </div>
        </div>

        <div style={styles.headerRight}>
          <Avatar name={coachName || "Coach"} avatarUrl={coachAvatarUrl} size={28} />
          {!isMobile && <span style={styles.coachInfo}>{coachName || "Coach"}</span>}
          <button style={styles.signOutBtn} onClick={handleSignOut}>Sign out</button>
        </div>
      </header>

      {billingBanner && (
        <Link href="/settings" style={styles.billingBanner}>
          {billingBanner.type === "canceled"
            ? "Your subscription is cancelled — the account is read-only. Tap to resubscribe."
            : billingBanner.daysLeft != null && billingBanner.daysLeft > 0
            ? `Payment failed — update your card within ${billingBanner.daysLeft} day${billingBanner.daysLeft === 1 ? "" : "s"} to avoid losing access. Tap to fix.`
            : "Payment failed — the account is now read-only until this is fixed. Tap to fix."}
        </Link>
      )}

      <div style={styles.body}>
        {isMobile && sidebarOpen && (
          <div style={styles.backdrop} onClick={() => setSidebarOpen(false)} />
        )}
        <aside
          style={{
            ...styles.sidebar,
            ...(isMobile
              ? {
                  ...styles.sidebarMobile,
                  transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
                }
              : {}),
          }}
        >
          {NAV_ITEMS.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{ ...styles.navItem, ...(active ? styles.navItemActive : {}) }}
              >
                <span style={{ marginRight: 8 }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </aside>
        <main style={{ ...styles.main, ...(isMobile ? styles.mainMobile : {}) }}>{children}</main>
      </div>

      {branding.showPoweredBy && (
        <div style={styles.poweredBy}>Powered by VIS BUILD</div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: { display: "flex", flexDirection: "column", minHeight: "100vh" },
  header: {
    height: 56,
    background: "var(--ink)",
    borderBottom: "1px solid var(--line)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px",
    flexShrink: 0,
  },
  brand: {
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 700,
    fontSize: 20,
    letterSpacing: 2,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  logo: { height: 32, width: "auto", objectFit: "contain" },
  orgSeparator: { fontSize: 14, fontWeight: 400, color: "var(--mute)", letterSpacing: 0 },
  headerRight: { display: "flex", alignItems: "center", gap: 12 },
  coachInfo: { fontSize: 13, color: "var(--mute)" },
  hamburgerBtn: {
    background: "transparent",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 8,
    width: 34,
    height: 34,
    fontSize: 16,
    cursor: "pointer",
    flexShrink: 0,
  },
  billingBanner: {
    display: "block",
    background: "#2a1e00",
    color: "#F59E0B",
    fontSize: 13,
    fontWeight: 600,
    textAlign: "center",
    padding: "8px 16px",
    textDecoration: "none",
    borderBottom: "1px solid #F59E0B44",
    flexShrink: 0,
  },
  signOutBtn: {
    background: "transparent",
    border: "1px solid var(--line)",
    color: "var(--mute)",
    borderRadius: 8,
    padding: "6px 12px",
    fontSize: 13,
    cursor: "pointer",
  },
  body: { display: "flex", flex: 1, minHeight: 0 },
  sidebar: {
    width: 220,
    borderRight: "1px solid var(--line)",
    background: "var(--panel)",
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    flexShrink: 0,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 9,
    color: "var(--mute)",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 600,
  },
  navItemActive: {
    background: "var(--panel2)",
    color: "var(--text)",
    boxShadow: "inset 0 0 0 1px var(--line)",
  },
  // Off-canvas drawer on mobile — fixed over the content rather than an
  // in-flow flex sibling, so it doesn't eat width from `main` at all
  // while hidden. Slides via transform (set inline, alongside these
  // base styles) rather than being unmounted, so the slide animates.
  sidebarMobile: {
    position: "fixed",
    top: 56, // below the header
    left: 0,
    bottom: 0,
    zIndex: 50,
    boxShadow: "2px 0 16px rgba(0,0,0,.4)",
    transition: "transform 0.2s ease-out",
    overflowY: "auto",
  },
  backdrop: {
    position: "fixed",
    top: 56,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(6,9,12,.6)",
    zIndex: 40,
  },
  main: { flex: 1, minWidth: 0, overflowY: "auto", padding: 24 },
  // No minWidth:0 here — that's what let flexbox squeeze this column
  // down to whatever was left after the sidebar on a phone, wrapping
  // and overlapping content instead of just needing a sideways scroll.
  // Dropping it lets `main` keep its content's natural width and
  // overflow horizontally instead, which overflowX below then scrolls.
  mainMobile: { minWidth: undefined, overflowX: "auto", padding: 14 },
  poweredBy: { textAlign: "center", fontSize: 11, color: "var(--mute)", padding: "8px 0", borderTop: "1px solid var(--line)" },
};

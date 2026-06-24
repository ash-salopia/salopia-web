"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

const NAV_ITEMS = [
  { href: "/athletes", label: "Athletes", icon: "👤" },
  { href: "/live", label: "Live group", icon: "⭐" },
  { href: "/community", label: "Community", icon: "💬" },
  { href: "/templates", label: "Templates", icon: "▦" },
  { href: "/programmes", label: "Programmes", icon: "📁" },
  { href: "/library", label: "Library", icon: "📚" },
  { href: "/dashboard", label: "Dashboard", icon: "📋" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export default function CoachShell({
  coachName,
  orgName,
  children,
}: {
  coachName: string;
  orgName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.brand}>AthletiQ</div>
        <div style={styles.headerRight}>
          <span style={styles.coachInfo}>
            {coachName || "Coach"}
            {orgName ? ` · ${orgName}` : ""}
          </span>
          <button style={styles.signOutBtn} onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>
      <div style={styles.body}>
        <aside style={styles.sidebar}>
          {NAV_ITEMS.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  ...styles.navItem,
                  ...(active ? styles.navItemActive : {}),
                }}
              >
                <span style={{ marginRight: 8 }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </aside>
        <main style={styles.main}>{children}</main>
      </div>
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
    color: "var(--accent)",
  },
  headerRight: { display: "flex", alignItems: "center", gap: 12 },
  coachInfo: { fontSize: 13, color: "var(--mute)" },
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
  main: { flex: 1, minWidth: 0, overflowY: "auto", padding: 24 },
};

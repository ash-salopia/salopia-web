"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import AthletePageHeading from "@/components/AthletePageHeading";

// Training Reports the coach has shared to the athlete's app (0123).
// Each opens the same /r/<id> page an emailed link goes to.

interface SharedReport {
  id: string;
  title: string;
  range_label: string;
  created_at: string;
  expires_at: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function AthleteReportsPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;
  const [reports, setReports] = useState<SharedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`/api/athlete-link/reports?token=${token}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setReports(d.reports ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => router.push(`/a/${token}`)}>← Back</button>
        <div style={s.brand}>VIS BUILD</div>
        <div style={{ width: 60 }} />
      </div>
      <AthletePageHeading emoji="📊" title="Reports" />

      <div style={s.content}>
        {error && <div style={s.errorBox}>{error}</div>}
        {loading ? (
          <div style={s.loading}>Loading…</div>
        ) : reports.length === 0 ? (
          <div style={s.emptyState}>
            <div style={{ fontSize: 40 }}>📊</div>
            <div style={s.emptyText}>No reports yet</div>
            <div style={s.emptySubtext}>When your coach shares a training report, it&apos;ll appear here.</div>
          </div>
        ) : (
          reports.map((r) => (
            <a key={r.id} href={`/r/${r.id}`} style={s.card}>
              <div style={{ fontSize: 24 }}>📈</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.cardTitle}>{r.range_label || r.title}</div>
                <div style={s.cardMeta}>Shared {formatDate(r.created_at)} · available until {formatDate(r.expires_at)}</div>
              </div>
              <span style={s.openBtn}>Open</span>
            </a>
          ))
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" },
  header: { height: 56, background: "var(--ink)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", flexShrink: 0 },
  brand: { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, color: "var(--accent)" },
  backBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer" },
  content: { padding: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 480, width: "100%" },
  errorBox: { background: "#2a0c0c", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13 },
  loading: { fontSize: 14, color: "var(--mute)", padding: "20px 0" },
  emptyState: { textAlign: "center", padding: "40px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  emptyText: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  emptySubtext: { fontSize: 13, color: "var(--mute)", maxWidth: 280, lineHeight: 1.5 },
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, display: "flex", alignItems: "center", gap: 12, textDecoration: "none" },
  cardTitle: { fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 3 },
  cardMeta: { fontSize: 11, color: "var(--mute)" },
  openBtn: { background: "var(--accent)", color: "#0a1420", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, flexShrink: 0 },
};

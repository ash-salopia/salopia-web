"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Template } from "@/types";

export default function AthleteLibraryPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [startingDefId, setStartingDefId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/athlete-link/library?token=${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setTemplates(d.templates ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleStart = async (defId: string) => {
    setStartingDefId(defId);
    setError("");
    try {
      const res = await fetch("/api/athlete-link/library/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, templateDefId: defId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Could not start session");
      router.push(`/a/${token}/sessions/${data.sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start session");
      setStartingDefId(null);
    }
  };

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => router.push(`/a/${token}`)}>← Back</button>
        <div style={s.brand}>AthletiQ</div>
        <div style={{ width: 60 }} />
      </div>
      <div style={{ padding: "12px 16px 0", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: "var(--text)" }}>
        📚 Session Library
      </div>

      <div style={s.content}>
        {error && <div style={s.errorBox}>{error}</div>}

        {loading ? (
          <div style={s.loading}>Loading…</div>
        ) : templates.length === 0 ? (
          <div style={s.emptyState}>
            <div style={s.emptyIcon}>📚</div>
            <div style={s.emptyText}>No library sessions yet</div>
            <div style={s.emptySubtext}>
              Your coach can share extra sessions here for you to do informally — separate from your regular programme.
            </div>
          </div>
        ) : (
          <div style={s.list}>
            {templates.map((t) => {
              const defs = t.defs ?? [];
              const single = defs.length === 1 ? defs[0] : null;
              return (
                <div key={t.id} style={s.card}>
                  <div style={s.cardHeader}>
                    <div style={s.cardTitle}>{t.name}</div>
                    {single && (
                      <button
                        style={s.startBtn}
                        onClick={() => handleStart(single.id)}
                        disabled={startingDefId === single.id}
                      >
                        {startingDefId === single.id ? "Starting…" : "Start"}
                      </button>
                    )}
                  </div>

                  {single && (single.exercises ?? []).length > 0 && (
                    <div style={s.exerciseList}>
                      {single.exercises.map((e, i) => (
                        <span key={i} style={s.exerciseChip}>{e.name}</span>
                      ))}
                    </div>
                  )}

                  {!single && defs.length > 0 && (
                    <div style={s.defList}>
                      {defs.map((def) => (
                        <div key={def.id} style={s.defRow}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={s.defName}>{def.name}</div>
                            {(def.exercises ?? []).length > 0 && (
                              <div style={s.exerciseList}>
                                {def.exercises.map((e, i) => (
                                  <span key={i} style={s.exerciseChip}>{e.name}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            style={s.startBtn}
                            onClick={() => handleStart(def.id)}
                            disabled={startingDefId === def.id}
                          >
                            {startingDefId === def.id ? "Starting…" : "Start"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" },
  header: {
    height: 56, background: "var(--ink)", borderBottom: "1px solid var(--line)",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 16px", flexShrink: 0,
  },
  brand: { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, color: "var(--accent)" },
  backBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer" },
  content: { padding: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 480, width: "100%" },
  errorBox: { background: "#2a0c0c", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13 },
  loading: { fontSize: 14, color: "var(--mute)", padding: "20px 0" },
  emptyState: { textAlign: "center" as const, padding: "40px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  emptySubtext: { fontSize: 13, color: "var(--mute)", maxWidth: 300, lineHeight: 1.5 },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  card: {
    background: "var(--panel)", border: "1px solid var(--line)",
    borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10,
  },
  cardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  defList: { display: "flex", flexDirection: "column", gap: 10 },
  defRow: {
    display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10,
    background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: 10,
  },
  defName: { fontSize: 13, fontWeight: 700, color: "var(--text)" },
  exerciseList: { display: "flex", flexWrap: "wrap" as const, gap: 6, marginTop: 6 },
  exerciseChip: {
    fontSize: 11, background: "var(--accent-dim)", color: "var(--accent)",
    border: "1px solid var(--accent)44", borderRadius: 6, padding: "3px 8px",
  },
  startBtn: {
    background: "var(--accent)", color: "#0a1420", border: "none",
    borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700,
    cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" as const,
  },
};

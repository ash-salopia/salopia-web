"use client";

// Side-by-side comparison of every session sharing this one's exact
// name (case/whitespace-insensitive) for this athlete - "the same
// benchmark workout, done N times". Matched by name rather than
// source_session_id since that link only exists for sessions literally
// copied via "copy to dates"/"update future occurrences" - a session
// reloaded from a template, or rebuilt from scratch, has no such link
// but does keep the same name (0079).

import { useEffect, useState } from "react";
import { listSessionsForAthlete } from "@/lib/data/sessions";
import { findRepeatedSessionGroups, compareSessionGroup, type SessionCompareResult } from "@/lib/report-calc";
import type { Session } from "@/types";

export default function SessionCompareModal({
  athleteId,
  session,
  onClose,
}: {
  athleteId: string;
  session: Session;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SessionCompareResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSessionsForAthlete(athleteId)
      .then((all) => {
        if (cancelled) return;
        const groups = findRepeatedSessionGroups(all);
        const subType = session.type === "hyrox" ? session.hyrox_type : session.type === "cardio" ? (session as any).cardio_type : null;
        const match = groups.find(
          (g) => g.type === session.type && g.subType === (subType ?? null) && g.name.toLowerCase() === session.name.trim().toLowerCase()
        );
        if (!match) {
          setError("No other sessions with this exact name found for this athlete.");
          setLoading(false);
          return;
        }
        const groupSessions = all.filter((s) => match.sessions.some((m) => m.id === s.id));
        setResult(compareSessionGroup(groupSessions));
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load comparison");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [athleteId, session]);

  const fmtDate = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.headerRow}>
          <div style={s.title}>Compare attempts{result ? ` — ${result.name}` : ""}</div>
          <button style={s.closeBtn} onClick={onClose}>×</button>
        </div>
        <div style={s.body}>
          {loading && <div style={s.note}>Loading…</div>}
          {!loading && error && <div style={s.note}>{error}</div>}
          {!loading && result && (
            <div style={{ overflowX: "auto" as const }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={{ ...s.th, textAlign: "left" as const, position: "sticky" as const, left: 0, background: "var(--panel)" }}>
                      Exercise
                    </th>
                    {result.sessions.map((sess) => (
                      <th key={sess.id} style={s.th}>{fmtDate(sess.date)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.length === 0 && (
                    <tr><td colSpan={result.sessions.length + 1} style={s.td}>Nothing logged yet on any of these attempts.</td></tr>
                  )}
                  {result.rows.map((row, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "var(--panel2)" }}>
                      <td style={{ ...s.td, textAlign: "left" as const, position: "sticky" as const, left: 0, background: i % 2 === 0 ? "var(--panel)" : "var(--panel2)" }}>
                        <div style={{ fontWeight: 700 }}>{row.group}</div>
                        <div style={{ fontSize: 11, color: "var(--mute)" }}>{row.label}</div>
                      </td>
                      {result.sessions.map((sess) => {
                        const cell = row.cells.find((c) => c.sessionId === sess.id);
                        return (
                          <td key={sess.id} style={s.td}>
                            {cell ? (cell.display ?? cell.value) : <span style={{ color: "var(--mute)" }}>—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, width: "100%", maxWidth: 640, maxHeight: "85vh", display: "flex", flexDirection: "column" as const, overflow: "hidden" },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--line)", flexShrink: 0 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700 },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 20, cursor: "pointer" },
  body: { overflowY: "auto" as const, padding: 20 },
  note: { fontSize: 13, color: "var(--mute)" },
  table: { borderCollapse: "collapse" as const, width: "100%", fontSize: 13 },
  th: { padding: "8px 12px", fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.03em", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" as const },
  td: { padding: "8px 12px", textAlign: "center" as const, borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" as const },
};

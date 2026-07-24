"use client";

import { useState, useEffect } from "react";
import { formatPBValue } from "@/lib/data/personal-bests";

interface HistorySet {
  weight: string;
  reps: string;
  time?: string;
  done: boolean;
}

interface HistoryEntry {
  date: string;
  bestSet: HistorySet | null;
  allSets: HistorySet[];
}

interface PBRecord {
  weight_kg: number | null;
  reps: number | null;
  time_seconds: number | null;
  date: string;
}

function formatSetChip(set: HistorySet): string {
  if ((set.weight ?? "").trim()) return `${set.weight}kg${set.reps ? ` × ${set.reps}` : ""}`;
  if ((set.time ?? "").trim()) return `${set.time}s`;
  if ((set.reps ?? "").trim()) return `${set.reps} reps`;
  return "BW";
}

interface Props {
  token: string;
  exerciseName: string;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default function AthleteExerciseHistoryModal({ token, exerciseName, onClose }: Props) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [pb, setPb] = useState<PBRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(
      `/api/athlete-link/exercise-history?token=${encodeURIComponent(token)}&exercise_name=${encodeURIComponent(exerciseName)}`,
      { cache: "no-store" }
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setHistory(data.history ?? []);
        setPb(data.pb ?? null);
      })
      .catch((e) => setError(e.message ?? "Could not load history"))
      .finally(() => setLoading(false));
  }, [token, exerciseName]);

  return (
    <div style={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.modal}>
        <div style={s.header}>
          <div>
            <div style={s.title}>📊 {exerciseName}</div>
            <div style={s.subtitle}>History & personal best</div>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {error && <div style={s.errorBox}>{error}</div>}

        {loading ? (
          <div style={s.empty}>Loading history…</div>
        ) : (
          <div style={s.body}>
            {pb && (
              <div style={s.pbBanner}>
                <div style={s.pbLabel}>🏆 Personal Best</div>
                <div style={s.pbValue}>{formatPBValue(pb)}</div>
                <div style={s.pbDate}>{formatDate(pb.date)}</div>
              </div>
            )}

            {history.length === 0 ? (
              <div style={s.empty}>No previous sessions found for this exercise.</div>
            ) : (
              <>
                <div style={s.sectionLabel}>Previous sessions</div>
                <div style={s.list}>
                  {history.map((entry, i) => (
                    <div key={`${entry.date}-${i}`} style={s.entry}>
                      <div style={s.entryHeader}>
                        <div style={s.entryDate}>{formatDate(entry.date)}</div>
                        {entry.bestSet && (
                          <div style={s.entryPeak}>
                            Peak: <strong>{formatSetChip(entry.bestSet)}</strong>
                          </div>
                        )}
                      </div>
                      {entry.allSets.length > 0 ? (
                        <div style={s.setsRow}>
                          {entry.allSets
                            .filter((set) => set.done || (set.weight ?? "").trim() || (set.time ?? "").trim() || (set.reps ?? "").trim())
                            .map((set, j) => (
                              <div key={j} style={s.setChip}>
                                {formatSetChip(set)}
                              </div>
                            ))}
                        </div>
                      ) : (
                        <div style={s.noSets}>No completed sets recorded</div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 300, padding: 16,
  },
  modal: {
    background: "var(--panel)", border: "1px solid var(--line)",
    borderRadius: 16, width: "100%", maxWidth: 500,
    maxHeight: "80vh", display: "flex", flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    padding: "16px 18px 12px", borderBottom: "1px solid var(--line)", flexShrink: 0,
  },
  title: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  subtitle: { fontSize: 12, color: "var(--mute)", marginTop: 2 },
  closeBtn: {
    background: "transparent", border: "none", color: "var(--mute)",
    fontSize: 18, cursor: "pointer", padding: 4,
  },
  errorBox: {
    background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B",
    borderRadius: 8, padding: "8px 12px", fontSize: 13, margin: "10px 18px 0",
  },
  body: { overflowY: "auto", padding: "12px 18px 18px", display: "flex", flexDirection: "column", gap: 12 },
  pbBanner: {
    background: "var(--accent-dim)", border: "1px solid var(--accent)44",
    borderRadius: 12, padding: "12px 14px",
  },
  pbLabel: { fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" as const, letterSpacing: "0.06em" },
  pbValue: { fontSize: 22, fontWeight: 700, color: "var(--text)", marginTop: 4 },
  pbDate: { fontSize: 11, color: "var(--mute)", marginTop: 2 },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.06em" },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  entry: {
    background: "var(--ink)", border: "1px solid var(--line)",
    borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6,
  },
  entryHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  entryDate: { fontSize: 11, color: "var(--mute)" },
  entryPeak: { fontSize: 12, color: "var(--mute)" },
  setsRow: { display: "flex", gap: 6, flexWrap: "wrap" as const },
  setChip: {
    background: "var(--panel)", border: "1px solid var(--line)",
    borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "var(--text)",
  },
  noSets: { fontSize: 11, color: "var(--mute)", fontStyle: "italic" as const },
  empty: { padding: "24px 18px", textAlign: "center" as const, color: "var(--mute)", fontSize: 13 },
};

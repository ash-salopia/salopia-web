"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";

interface HistorySet {
  weight: string;
  reps: string;
  done: boolean;
}

interface HistoryEntry {
  session_id: string;
  session_name: string;
  date: string;
  sets: HistorySet[];
  maxWeight: number | null;
  totalReps: number;
}

interface PBRecord {
  id: string;
  weight_kg: number | null;
  reps: number | null;
  date: string;
}

interface Props {
  athleteId: string;
  exerciseName: string;
  currentSessionId: string;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default function ExerciseHistoryModal({ athleteId, exerciseName, currentSessionId, onClose }: Props) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [pb, setPb] = useState<PBRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!athleteId || !exerciseName) return;
    load();
  }, [athleteId, exerciseName]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();

      // Fetch exercise history across all sessions
      const { data: exData, error: exErr } = await supabase
        .from("session_exercises")
        .select("session_id, log, sessions!inner(id, name, date, athlete_id)")
        .ilike("name", exerciseName)
        .eq("sessions.athlete_id", athleteId)
        .order("date", { ascending: false, foreignTable: "sessions" })
        .limit(20);

      if (exErr) throw exErr;

      // Build history entries, skip current session
      const entries: HistoryEntry[] = [];
      for (const row of exData ?? []) {
        const s = Array.isArray(row.sessions) ? row.sessions[0] : row.sessions as any;
        if (s.id === currentSessionId) continue;

        const sets: HistorySet[] = (row.log ?? []).filter((set: any) =>
          set.done || (set.weight && String(set.weight).trim())
        );

        const weights = sets
          .map((set) => parseFloat(String(set.weight)))
          .filter((w) => !isNaN(w) && w > 0);

        entries.push({
          session_id: s.id,
          session_name: s.name,
          date: s.date,
          sets,
          maxWeight: weights.length > 0 ? Math.max(...weights) : null,
          totalReps: sets.reduce((n, set) => n + (parseInt(String(set.reps)) || 0), 0),
        });
      }

      setHistory(entries);

      // Fetch PB from personal_bests table
      const { data: pbData } = await supabase
        .from("personal_bests")
        .select("id, weight_kg, reps, date")
        .ilike("exercise_name", exerciseName)
        .eq("athlete_id", athleteId)
        .order("weight_kg", { ascending: false })
        .limit(1)
        .single();

      setPb(pbData ?? null);
    } catch (e: any) {
      setError(e.message ?? "Could not load history");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.modal}>
        {/* Header */}
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
            {/* PB banner */}
            {pb && (
              <div style={s.pbBanner}>
                <div style={s.pbLabel}>🏆 Personal Best</div>
                <div style={s.pbValue}>
                  {pb.weight_kg != null ? `${pb.weight_kg}kg` : "Bodyweight"}
                  {pb.reps ? ` × ${pb.reps}` : ""}
                </div>
                <div style={s.pbDate}>{formatDate(pb.date)}</div>
              </div>
            )}

            {/* History list */}
            {history.length === 0 ? (
              <div style={s.empty}>No previous sessions found for this exercise.</div>
            ) : (
              <>
                <div style={s.sectionLabel}>Previous sessions</div>
                <div style={s.list}>
                  {history.map((entry) => (
                    <div key={entry.session_id} style={s.entry}>
                      <div style={s.entryHeader}>
                        <div style={s.entryName}>{entry.session_name}</div>
                        <div style={s.entryDate}>{formatDate(entry.date)}</div>
                      </div>
                      {entry.maxWeight != null && (
                        <div style={s.entryPeak}>
                          Peak: <strong>{entry.maxWeight}kg</strong>
                        </div>
                      )}
                      {entry.sets.length > 0 ? (
                        <div style={s.setsRow}>
                          {entry.sets.map((set, i) => (
                            <div key={i} style={s.setChip}>
                              {set.weight ? `${set.weight}kg` : "BW"}
                              {set.reps ? ` × ${set.reps}` : ""}
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
  entryName: { fontSize: 13, fontWeight: 600, color: "var(--text)" },
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

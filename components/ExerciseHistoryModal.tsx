"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatPBValue } from "@/lib/data/personal-bests";

interface HistorySet {
  weight: string;
  reps: string;
  time?: string;
  done: boolean;
}

interface HistoryEntry {
  session_id: string;
  session_name: string;
  date: string;
  sets: HistorySet[];
  bestSet: HistorySet | null;
  totalReps: number;
}

interface PBRecord {
  id: string;
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

function bestOfSets(sets: HistorySet[]): HistorySet | null {
  return sets.reduce((best: HistorySet | null, s) => {
    const sw = parseFloat(s.weight) || 0;
    const bw = parseFloat(best?.weight ?? "") || 0;
    if (sw > 0 || bw > 0) return sw > bw ? s : best;
    const st = parseFloat(s.time ?? "") || 0;
    const bt = parseFloat(best?.time ?? "") || 0;
    if (st > 0 || bt > 0) return st > bt ? s : best;
    const sr = parseInt(s.reps) || 0;
    const br = parseInt(best?.reps ?? "") || 0;
    return sr > br ? s : best;
  }, sets[0] ?? null);
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
          set.done || (set.weight && String(set.weight).trim()) || (set.time && String(set.time).trim()) || (set.reps && String(set.reps).trim())
        );

        entries.push({
          session_id: s.id,
          session_name: s.name,
          date: s.date,
          sets,
          bestSet: bestOfSets(sets),
          totalReps: sets.reduce((n, set) => n + (parseInt(String(set.reps)) || 0), 0),
        });
      }

      setHistory(entries);

      // Fetch PB — could be weighted, bodyweight+reps, or bodyweight+time
      // (see detectPB's docstring in app/api/athlete-link/log/route.ts).
      // Check all three shapes, use whichever this exercise has data in.
      const pbSelect = "id, weight_kg, reps, time_seconds, date";
      const pbBase = () =>
        supabase.from("personal_bests").select(pbSelect).ilike("exercise_name", exerciseName).eq("athlete_id", athleteId);
      const [{ data: weightedPb }, { data: repsPb }, { data: timePb }] = await Promise.all([
        pbBase().not("weight_kg", "is", null).order("weight_kg", { ascending: false }).limit(1).maybeSingle(),
        pbBase().is("weight_kg", null).is("time_seconds", null).order("reps", { ascending: false }).limit(1).maybeSingle(),
        pbBase().not("time_seconds", "is", null).order("time_seconds", { ascending: false }).limit(1).maybeSingle(),
      ]);

      setPb(weightedPb ?? repsPb ?? timePb ?? null);
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
                <div style={s.pbValue}>{formatPBValue(pb)}</div>
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
                      {entry.bestSet && (
                        <div style={s.entryPeak}>
                          Peak: <strong>{formatSetChip(entry.bestSet)}</strong>
                        </div>
                      )}
                      {entry.sets.length > 0 ? (
                        <div style={s.setsRow}>
                          {entry.sets.map((set, i) => (
                            <div key={i} style={s.setChip}>
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

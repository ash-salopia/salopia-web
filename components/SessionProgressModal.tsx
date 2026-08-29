"use client";

// Plain, data-driven "vs last time" view for a logged session — the
// same best-set / total-load comparison the coach sees in Live Group,
// computed entirely from saved data. No AI, no tokens.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import {
  findPreviousExerciseEntry, formatPrevSets, computeBestSetSignal, computeTotalLoadSignal, progressionArrow,
} from "@/lib/session-progress";
import type { Session, SessionExercise } from "@/types";

type PriorSession = { athlete_id: string; date: string; exercises: SessionExercise[] };

const DIR_COLOR: Record<"up" | "down" | "same", string> = {
  up: "#2E9E5B", down: "#E53935", same: "var(--mute)",
};

function fmtShort(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function SessionProgressModal({
  session, athleteId, onClose,
}: {
  session: Session;
  athleteId: string;
  onClose: () => void;
}) {
  const [prior, setPrior] = useState<PriorSession[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("sessions")
      .select("id, athlete_id, date, session_exercises(name, log, time, is_bodyweight)")
      .eq("athlete_id", athleteId)
      .lt("date", session.date)
      .neq("id", session.id)
      .order("date", { ascending: false })
      .limit(60)
      .then(({ data, error }) => {
        if (error) { setError("Could not load previous sessions"); return; }
        setPrior(
          (data ?? []).map((s: any) => ({
            athlete_id: s.athlete_id, date: s.date, exercises: (s.session_exercises ?? []) as SessionExercise[],
          }))
        );
      });
  }, [athleteId, session.id, session.date]);

  const exercises = [...(session.exercises ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.head}>
          <div>
            <div style={s.title}>Progress vs last time</div>
            <div style={s.sub}>{session.name} · {fmtShort(session.date)}</div>
          </div>
          <button style={s.close} onClick={onClose}>✕</button>
        </div>

        {error && <div style={s.error}>{error}</div>}

        <div style={s.body}>
          {prior === null ? (
            <div style={s.muted}>Loading…</div>
          ) : exercises.length === 0 ? (
            <div style={s.muted}>No exercises in this session.</div>
          ) : (
            exercises.map((ex) => {
              const nowSets = formatPrevSets(ex);
              const prevEntry = findPreviousExerciseEntry(prior, athleteId, ex.name, session.date);
              const prevEx = prevEntry?.exercise ?? null;
              const best = computeBestSetSignal(ex, prevEx);
              const total = computeTotalLoadSignal(ex, prevEx);

              return (
                <div key={ex.id} style={s.card}>
                  <div style={s.exName}>{ex.name}</div>

                  <div style={s.row}>
                    <span style={s.rowLabel}>This session</span>
                    <span style={s.rowVal}>{nowSets ?? "not logged"}</span>
                  </div>
                  {prevEx ? (
                    <div style={s.row}>
                      <span style={s.rowLabel}>{fmtShort(prevEntry!.date)}</span>
                      <span style={{ ...s.rowVal, color: "var(--mute)" }}>{formatPrevSets(prevEx) ?? "—"}</span>
                    </div>
                  ) : (
                    <div style={s.row}>
                      <span style={s.rowLabel}>Last time</span>
                      <span style={{ ...s.rowVal, color: "var(--mute)" }}>no previous session for this exercise</span>
                    </div>
                  )}

                  {(best || total) && (
                    <div style={s.signals}>
                      {best && (
                        <span style={{ ...s.signal, color: DIR_COLOR[best.direction] }}>
                          {progressionArrow(best.direction)} Best set&nbsp;<b>{best.label}</b>
                        </span>
                      )}
                      {total && (
                        <span style={{ ...s.signal, color: DIR_COLOR[total.direction] }}>
                          {progressionArrow(total.direction)} Total load&nbsp;<b>{total.label}</b>
                        </span>
                      )}
                    </div>
                  )}
                  {prevEx && !best && !total && nowSets && (
                    <div style={s.muted}>Not directly comparable to last time.</div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div style={s.foot}>
          <span style={s.legend}>
            <span style={{ color: DIR_COLOR.up }}>▲ improvement</span> · <span style={{ color: DIR_COLOR.down }}>▼ down</span> · <span style={{ color: DIR_COLOR.same }}>＝ same</span>
          </span>
          <button style={s.doneBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "85vh", display: "flex", flexDirection: "column" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "16px 18px 12px" },
  title: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  sub: { fontSize: 12, color: "var(--mute)", marginTop: 2 },
  close: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 18, cursor: "pointer" },
  error: { margin: "0 18px 8px", fontSize: 12, color: "#FF6B6B" },
  body: { overflowY: "auto", padding: "0 18px 8px", display: "flex", flexDirection: "column", gap: 8 },
  muted: { fontSize: 12, color: "var(--mute)", padding: "4px 0" },
  card: { border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", background: "var(--ink)" },
  exName: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 6 },
  row: { display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, lineHeight: 1.6 },
  rowLabel: { color: "var(--mute)", flexShrink: 0 },
  rowVal: { color: "var(--text)", textAlign: "right" },
  signals: { display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 8, fontSize: 12, fontWeight: 600 },
  signal: { whiteSpace: "nowrap" },
  foot: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderTop: "1px solid var(--line)", gap: 10, flexWrap: "wrap" },
  legend: { fontSize: 10, color: "var(--mute)" },
  doneBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
};

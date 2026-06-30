"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listLiveGroupAthletes } from "@/lib/data/athletes";
import { listSessionsForAthletes, pickActiveSession, toggleSetDone } from "@/lib/data/sessions";
import type { Athlete, Session, SessionType } from "@/types";

const TYPE_META: Record<SessionType, { label: string; color: string; dim: string }> = {
  strength: { label: "Strength", color: "#3B8BEB", dim: "#162743" },
  hyrox: { label: "Hyrox", color: "#B388FF", dim: "#2a2240" },
  cardio: { label: "Cardio", color: "#4DC3FF", dim: "#1a2c38" },
  power_speed: { label: "Power/Speed", color: "#A855F7", dim: "#2a1a4a" },
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return iso;
  }
}

export default function LiveGroupPage() {
  const router = useRouter();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const liveAthletes = await listLiveGroupAthletes();
      setAthletes(liveAthletes);
      const sessionData = await listSessionsForAthletes(liveAthletes.map((a) => a.id));
      setSessions(sessionData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load live group");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleToggleSet = async (
    sessionId: string,
    exerciseId: string,
    setIndex: number,
    currentLog: { weight: string; reps: string; done: boolean }[]
  ) => {
    // Optimistic update first, so tapping a dot during a live group
    // session feels instant rather than waiting on a round trip.
    setSessions((prev) =>
      prev.map((s) =>
        s.id !== sessionId
          ? s
          : {
              ...s,
              exercises: s.exercises?.map((e) =>
                e.id !== exerciseId
                  ? e
                  : { ...e, log: e.log.map((l, i) => (i === setIndex ? { ...l, done: !l.done } : l)) }
              ),
            }
      )
    );
    try {
      await toggleSetDone(exerciseId, setIndex, currentLog);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  };

  if (loading) return <div style={styles.empty}>Loading…</div>;

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Live group</h1>
      <p style={styles.subtitle}>
        Star athletes from their profile page to add them here for running a group session.
      </p>

      {error && <div style={styles.errorBox}>{error}</div>}

      {!athletes.length ? (
        <div style={styles.empty}>
          Live group is empty. Open an athlete&apos;s page and tap the ☆ star next to their name to
          add them here.
        </div>
      ) : (
        <div style={styles.grid}>
          {athletes.map((athlete) => {
            const sess = pickActiveSession(sessions, athlete.id);
            const meta = TYPE_META[sess?.type ?? "strength"];
            return (
              <div
                key={athlete.id}
                style={{ ...styles.card, borderLeftColor: meta.color }}
              >
                <div style={styles.cardHead} onClick={() => router.push(`/athletes/${athlete.id}`)}>
                  <div style={styles.avatar}>{athlete.name.slice(0, 1).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={styles.athleteName}>{athlete.name}</div>
                    <div style={styles.sessionInfo}>
                      {sess ? `${sess.name} · ${fmtDate(sess.date)}` : "No session scheduled"}
                    </div>
                  </div>
                  {sess && (
                    <span style={{ ...styles.typeBadge, background: meta.dim, color: meta.color }}>
                      {meta.label}
                    </span>
                  )}
                </div>

                {sess && sess.type === "strength" && (
                  <div style={styles.exList}>
                    {(sess.exercises ?? []).map((ex, i) => (
                      <div key={ex.id} style={styles.exRow}>
                        <span style={styles.exOrder}>{ex.order || i + 1}</span>
                        <span style={styles.exName}>{ex.name || "—"}</span>
                        <div style={styles.dots}>
                          {(ex.log ?? []).map((s, si) => (
                            <button
                              key={si}
                              onClick={() => handleToggleSet(sess.id, ex.id, si, ex.log ?? [])}
                              style={{ ...styles.dot, ...(s.done ? styles.dotOn : {}) }}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                    {!(sess.exercises ?? []).length && (
                      <div style={styles.noExercises}>No exercises in this session yet.</div>
                    )}
                  </div>
                )}

                {sess && sess.type !== "strength" && (
                  <div style={styles.noExercises}>
                    {sess.type} session — open the athlete&apos;s page to use the timer.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, margin: 0 },
  subtitle: { fontSize: 13, color: "var(--mute)", marginTop: 4, marginBottom: 20 },
  empty: { color: "var(--mute)", fontSize: 14, padding: "40px 0", textAlign: "center" },
  errorBox: {
    background: "#2a0c0c",
    border: "1px solid #FF6B6B44",
    color: "#FF6B6B",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    marginBottom: 16,
  },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 },
  card: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderLeft: "4px solid",
    borderRadius: 12,
    padding: 14,
  },
  cardHead: { display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 10 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: "var(--accent-dim)",
    color: "var(--accent)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 14,
    flexShrink: 0,
  },
  athleteName: { fontWeight: 700, fontSize: 14, color: "var(--text)" },
  sessionInfo: { fontSize: 11, color: "var(--mute)", marginTop: 2 },
  typeBadge: { fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap" },
  exList: { display: "flex", flexDirection: "column", gap: 6 },
  exRow: { display: "flex", alignItems: "center", gap: 8 },
  exOrder: { fontSize: 11, fontWeight: 700, color: "var(--accent)", minWidth: 22, flexShrink: 0, whiteSpace: "nowrap" },
  exName: { fontSize: 12, color: "var(--text)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  dots: { display: "flex", gap: 4 },
  dot: { width: 16, height: 16, borderRadius: "50%", border: "1px solid var(--line)", background: "transparent", cursor: "pointer", padding: 0 },
  dotOn: { background: "var(--good)", borderColor: "var(--good)" },
  noExercises: { fontSize: 12, color: "var(--mute)", padding: "4px 0" },
};

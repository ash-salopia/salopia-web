"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { updatePB, deletePB, createManualPB } from "@/lib/data/personal-bests";
import { listLibrary } from "@/lib/data/library";
import { archiveAthlete } from "@/lib/data/athletes";
import { todayISO } from "@/lib/date-utils";
import ExportModal from "@/components/ExportModal";
import type { Athlete } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PBRecord {
  id: string;
  exercise_name: string;
  weight_kg: number;
  reps: number | null;
  date: string;
}

interface ProgressPoint {
  date: string;
  weight: number;
}

interface SessionStat {
  total: number;
  thisMonth: number;
  completedSets: number;
  totalSets: number;
}

// ── Mini SVG progress chart ───────────────────────────────────────────────────

function ProgressChart({ points, exerciseName }: { points: ProgressPoint[]; exerciseName: string }) {
  if (points.length < 2) {
    return (
      <div style={c.noChart}>
        Not enough data to chart — needs 2+ logged sessions.
      </div>
    );
  }

  const W = 340, H = 120, PAD = { top: 10, right: 10, bottom: 24, left: 36 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const minW = Math.min(...points.map((p) => p.weight));
  const maxW = Math.max(...points.map((p) => p.weight));
  const range = maxW - minW || 1;

  const dates = points.map((p) => new Date(p.date + "T12:00:00Z").getTime());
  const minD = Math.min(...dates);
  const maxD = Math.max(...dates);
  const dateRange = maxD - minD || 1;

  const toX = (date: string) =>
    PAD.left + ((new Date(date + "T12:00:00Z").getTime() - minD) / dateRange) * plotW;
  const toY = (w: number) =>
    PAD.top + plotH - ((w - minW) / range) * plotH;

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.date).toFixed(1)},${toY(p.weight).toFixed(1)}`)
    .join(" ");

  // Y-axis tick values
  const yTicks = [minW, minW + range / 2, maxW].map((v) => Math.round(v));

  // X-axis: first and last date labels
  const fmtDate = (iso: string) =>
    new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  const pbPoint = points.reduce((best, p) => (p.weight > best.weight ? p : best), points[0]);

  return (
    <div style={c.chartWrap}>
      <div style={c.chartTitle}>{exerciseName} — weight over time</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W }}>
        {/* Y axis ticks */}
        {yTicks.map((v, i) => {
          const y = toY(v);
          return (
            <g key={i}>
              <line x1={PAD.left - 4} y1={y} x2={PAD.left} y2={y} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={9} fill="var(--mute)">{v}kg</text>
            </g>
          );
        })}

        {/* Grid lines */}
        {yTicks.map((v, i) => (
          <line key={i} x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)}
            stroke="var(--line)" strokeWidth={0.5} strokeDasharray="3,3" />
        ))}

        {/* X axis */}
        <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom}
          stroke="var(--line)" strokeWidth={1} />
        <text x={PAD.left} y={H - 6} fontSize={9} fill="var(--mute)">{fmtDate(points[0].date)}</text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize={9} fill="var(--mute)">
          {fmtDate(points[points.length - 1].date)}
        </text>

        {/* Line */}
        <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinejoin="round" />

        {/* Dots */}
        {points.map((p, i) => {
          const isPB = p.date === pbPoint.date && p.weight === pbPoint.weight;
          return (
            <circle
              key={i}
              cx={toX(p.date)}
              cy={toY(p.weight)}
              r={isPB ? 5 : 3}
              fill={isPB ? "var(--accent)" : "var(--panel)"}
              stroke="var(--accent)"
              strokeWidth={1.5}
            />
          );
        })}

        {/* PB label */}
        <text
          x={toX(pbPoint.date)}
          y={toY(pbPoint.weight) - 8}
          textAnchor="middle"
          fontSize={9}
          fill="var(--accent)"
          fontWeight={700}
        >
          PB {pbPoint.weight}kg
        </text>
      </svg>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  if (!iso) return "unknown";
  // Supabase returns full timestamps like "2024-01-15T10:30:00.000000+00:00"
  // and plain dates like "2024-01-15" — handle both
  const d = new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso);
  if (isNaN(d.getTime())) return "unknown";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AthleteProfilePage() {
  const params = useParams();
  const router = useRouter();
  const athleteId = params?.id as string;

  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [pbs, setPbs] = useState<PBRecord[]>([]);
  const [stats, setStats] = useState<SessionStat | null>(null);
  const [progressData, setProgressData] = useState<Record<string, ProgressPoint[]>>({});
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [editingPB, setEditingPB] = useState<string | null>(null); // exercise_name being edited
  const [editValues, setEditValues] = useState<{ weight: string; reps: string; date: string }>({ weight: "", reps: "", date: "" });
  const [savingPB, setSavingPB] = useState(false);
  const [addingPB, setAddingPB] = useState(false);
  const [newPB, setNewPB] = useState({ exercise_name: "", weight: "", reps: "", date: "" });
  const [library, setLibrary] = useState<{ name: string }[]>([]);
  const [pbNameDropdownOpen, setPbNameDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [progressLoading, setProgressLoading] = useState(false);
  const [error, setError] = useState("");
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (!athleteId) return;
    load();
    listLibrary().then((entries) => setLibrary(entries)).catch(() => {});
  }, [athleteId]);

  const load = async () => {
    setLoading(true);
    setError("");
    const supabase = createClient();
    const today = todayISO();
    const monthStart = today.slice(0, 7) + "-01";

    try {
      const [{ data: athleteData }, { data: pbData }, { data: sessionData }, { data: exerciseData }] = await Promise.all([
        supabase.from("athletes").select("*").eq("id", athleteId).single(),
        supabase.from("personal_bests").select("id, exercise_name, weight_kg, reps, date")
          .eq("athlete_id", athleteId).order("weight_kg", { ascending: false }),
        supabase.from("sessions").select("date, session_exercises(log)").eq("athlete_id", athleteId),
        // Also calculate PBs directly from session logs to catch coach-logged sessions
        supabase.from("session_exercises")
          .select("name, log, reps, sessions!inner(date, athlete_id)")
          .eq("sessions.athlete_id", athleteId),
      ]);

      setAthlete(athleteData);

      // Build PB map from personal_bests table
      const bestPerExercise = new Map<string, PBRecord>();
      for (const pb of pbData ?? []) {
        const key = pb.exercise_name.toLowerCase();
        if (!bestPerExercise.has(key) || pb.weight_kg > bestPerExercise.get(key)!.weight_kg) {
          bestPerExercise.set(key, { id: pb.id, exercise_name: pb.exercise_name, weight_kg: pb.weight_kg, reps: pb.reps, date: pb.date });
        }
      }

      // Also scan session_exercises logs to catch coach-logged sessions
      for (const ex of exerciseData ?? []) {
        const log: any[] = ex.log ?? [];
        const session = Array.isArray(ex.sessions) ? ex.sessions[0] : ex.sessions as any;
        const sessionDate: string = session?.date ?? today;
        const prescribedReps = parseInt(String(ex.reps ?? "1")) || 1;

        for (const set of log) {
          if (!set.done) continue;
          const w = parseFloat(String(set.weight));
          if (isNaN(w) || w <= 0) continue;
          const r = parseInt(String(set.reps)) || prescribedReps;
          const key = ex.name.toLowerCase();
          const existing = bestPerExercise.get(key);
          if (!existing || w > existing.weight_kg) {
            bestPerExercise.set(key, {
              id: existing?.id ?? "",  // keep real PB id if exists
              exercise_name: ex.name,
              weight_kg: w,
              reps: r,
              date: sessionDate,
            });
          }
        }
      }

      setPbs(Array.from(bestPerExercise.values()).sort((a, b) => b.weight_kg - a.weight_kg));

      // Session stats
      let totalSets = 0, completedSets = 0, thisMonth = 0;
      for (const s of sessionData ?? []) {
        if (s.date >= monthStart) thisMonth++;
        for (const ex of (s.session_exercises ?? []) as any[]) {
          const log = ex.log ?? [];
          totalSets += log.length;
          completedSets += log.filter((l: any) => l.done).length;
        }
      }
      setStats({ total: sessionData?.length ?? 0, thisMonth, completedSets, totalSets });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load profile");
    } finally {
      setLoading(false);
    }
  };

  const loadProgressForExercise = async (exerciseName: string) => {
    if (progressData[exerciseName]) {
      // Toggle — if already loaded, just expand/collapse
      setExpandedExercise(expandedExercise === exerciseName ? null : exerciseName);
      return;
    }

    setProgressLoading(true);
    setExpandedExercise(exerciseName);

    try {
      const supabase = createClient();
      // Get all logged sets for this exercise, with session dates
      const { data } = await supabase
        .from("session_exercises")
        .select("log, sessions!inner(date, athlete_id)")
        .ilike("name", exerciseName)
        .eq("sessions.athlete_id", athleteId)
        .order("date", { ascending: true, foreignTable: "sessions" });

      const points: ProgressPoint[] = [];
      for (const row of data ?? []) {
        const session = Array.isArray(row.sessions) ? row.sessions[0] : row.sessions as any;
        const date: string = session?.date;
        const log: any[] = row.log ?? [];
        const maxWeight = Math.max(...log.filter((s) => s.done && s.weight).map((s) => parseFloat(s.weight)).filter((w) => !isNaN(w) && w > 0));
        if (maxWeight > 0 && date) {
          points.push({ date, weight: maxWeight });
        }
      }

      // Deduplicate by date — take max weight per date
      const byDate = new Map<string, number>();
      for (const p of points) {
        byDate.set(p.date, Math.max(byDate.get(p.date) ?? 0, p.weight));
      }
      const deduplicated = Array.from(byDate.entries())
        .map(([date, weight]) => ({ date, weight }))
        .sort((a, b) => a.date.localeCompare(b.date));

      setProgressData((prev) => ({ ...prev, [exerciseName]: deduplicated }));
    } catch {
      setProgressData((prev) => ({ ...prev, [exerciseName]: [] }));
    } finally {
      setProgressLoading(false);
    }
  };

  if (loading) return <div style={p.loading}>Loading profile…</div>;

  return (
    <div style={p.page}>
      <div style={p.backRow}>
        <button style={p.backBtn} onClick={() => router.push(`/athletes/${athleteId}`)}>
          ← Back to sessions
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={p.ghostBtn} onClick={() => setExportOpen(true)}>
            📥 Export
          </button>
          <button style={p.dangerBtn} onClick={async () => {
            if (!athlete) return;
            if (!confirm(`Permanently delete ${athlete.name}? This removes all their sessions, exercises and data. This cannot be undone.`)) return;
            try {
              const { createClient } = await import("@/lib/supabase-browser");
              const supabase = createClient();
              await supabase.from("athletes").delete().eq("id", athleteId);
              router.push("/athletes");
            } catch { setError("Could not delete athlete"); }
          }}>
            Delete athlete
          </button>
          <button style={p.dangerBtn} onClick={async () => {
            if (!athlete) return;
            if (!confirm(`Archive ${athlete.name}? They will be hidden from your active roster but nothing is deleted.`)) return;
            try {
              await archiveAthlete(athleteId);
              router.push("/athletes");
            } catch { setError("Could not archive athlete"); }
          }}>
            📦 Archive
          </button>
        </div>
      </div>

      {error && <div style={p.errorBox}>{error}</div>}

      {athlete && (
        <div style={p.header}>
          <div style={p.avatar}>{athlete.name.charAt(0).toUpperCase()}</div>
          <div>
            <h1 style={p.name}>{athlete.name}</h1>
            {athlete.group && <div style={p.group}>{athlete.group}</div>}
            <div style={p.since}>Client since {formatDate(athlete.created_at)}</div>
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div style={p.statsRow}>
          {[
            { num: stats.total, label: "Total sessions" },
            { num: stats.thisMonth, label: "This month" },
            { num: stats.totalSets > 0 ? `${Math.round((stats.completedSets / stats.totalSets) * 100)}%` : "0%", label: "Set completion" },
            { num: pbs.length, label: "PB records" },
          ].map(({ num, label }) => (
            <div key={label} style={p.statCard}>
              <div style={p.statNum}>{num}</div>
              <div style={p.statLabel}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Settings section */}
      <div style={p.section}>
        <div style={p.sectionTitle}>Settings</div>

        <div style={p.checkinCard}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Session check-in</div>
            <div style={{ fontSize: 12, color: "var(--mute)", marginTop: 3 }}>
              {(athlete as any).checkin_enabled !== false
                ? "Check-in is enabled for this athlete. They will see readiness questions before each session."
                : "Check-in is disabled for this athlete. The check-in button will be hidden from their sessions."}
            </div>
          </div>
          <button
            style={{
              width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
              background: (athlete as any).checkin_enabled !== false ? "var(--accent)" : "var(--panel2)",
              position: "relative" as const, flexShrink: 0, transition: "background 0.2s",
            }}
            onClick={async () => {
              const next = !((athlete as any).checkin_enabled !== false);
              const supabase = createClient();
              await supabase.from("athletes").update({ checkin_enabled: next }).eq("id", athleteId);
              setAthlete((prev) => prev ? { ...prev, checkin_enabled: next } as any : prev);
            }}
          >
            <div style={{
              position: "absolute" as const, top: 3, left: 3, width: 18, height: 18,
              borderRadius: "50%", background: "#fff", transition: "transform 0.2s",
              transform: (athlete as any).checkin_enabled !== false ? "translateX(20px)" : "translateX(0)",
            }} />
          </button>
        </div>

        <div style={{ ...p.checkinCard, marginTop: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Hyrox sessions</div>
            <div style={{ fontSize: 12, color: "var(--mute)", marginTop: 3 }}>
              {(athlete as any).hyrox_enabled !== false
                ? "Hyrox sessions are enabled for this athlete."
                : "Hyrox sessions are hidden for this athlete — they won’t see the Hyrox type when sessions are created."}
            </div>
          </div>
          <button
            style={{
              width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
              background: (athlete as any).hyrox_enabled !== false ? "var(--accent)" : "var(--panel2)",
              position: "relative" as const, flexShrink: 0, transition: "background 0.2s",
            }}
            onClick={async () => {
              const current = (athlete as any).hyrox_enabled;
              const next = current === false ? true : false;
              setAthlete((prev) => prev ? { ...prev, hyrox_enabled: next } as any : prev);
              const supabase = createClient();
              const { error: upErr } = await supabase.from("athletes").update({ hyrox_enabled: next }).eq("id", athleteId);
              if (upErr) {
                setAthlete((prev) => prev ? { ...prev, hyrox_enabled: current } as any : prev);
                setError("Could not update Hyrox setting: " + upErr.message);
              }
            }}
          >
            <div style={{
              position: "absolute" as const, top: 3, left: 3, width: 18, height: 18,
              borderRadius: "50%", background: "#fff", transition: "transform 0.2s",
              transform: (athlete as any).hyrox_enabled !== false ? "translateX(20px)" : "translateX(0)",
            }} />
          </button>
        </div>
      </div>

      {/* PBs */}
      <div style={p.section}>
        <div style={p.sectionTitle}>🏆 Personal bests</div>
        <p style={p.sectionHint}>Click any exercise to see weight progression over time.</p>

        {/* Add manual PB button */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button
            style={p.ghostBtn}
            onClick={() => setAddingPB(v => !v)}
          >
            {addingPB ? "Cancel" : "+ Add manual PB"}
          </button>
        </div>

        {/* Add manual PB form */}
        {addingPB && (
          <div style={{ background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={p.sectionTitle}>Add manual PB</div>
            <div style={{ position: "relative" as const }}>
              <input
                placeholder="Exercise name"
                value={newPB.exercise_name}
                onChange={e => { setNewPB(v => ({ ...v, exercise_name: e.target.value })); setPbNameDropdownOpen(true); }}
                onFocus={() => setPbNameDropdownOpen(true)}
                onBlur={() => setTimeout(() => setPbNameDropdownOpen(false), 150)}
                style={p.editInput}
              />
              {pbNameDropdownOpen && newPB.exercise_name.trim() && (
                <div style={p.pbNameDropdown}>
                  {library
                    .filter(entry => entry.name.toLowerCase().includes(newPB.exercise_name.toLowerCase()))
                    .slice(0, 8)
                    .map((entry, i) => (
                      <button
                        key={i}
                        style={p.pbNameDropdownItem}
                        onMouseDown={() => { setNewPB(v => ({ ...v, exercise_name: entry.name })); setPbNameDropdownOpen(false); }}
                      >
                        {entry.name}
                      </button>
                    ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                placeholder="Weight (kg)"
                value={newPB.weight}
                onChange={e => setNewPB(v => ({ ...v, weight: e.target.value }))}
                style={{ ...p.editInput, flex: 1 }}
                inputMode="decimal"
              />
              <input
                placeholder="Reps"
                value={newPB.reps}
                onChange={e => setNewPB(v => ({ ...v, reps: e.target.value }))}
                style={{ ...p.editInput, flex: 1 }}
                inputMode="numeric"
              />
              <input
                type="date"
                value={newPB.date}
                onChange={e => setNewPB(v => ({ ...v, date: e.target.value }))}
                style={{ ...p.editInput, flex: 1 }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={p.ghostBtn} onClick={() => { setAddingPB(false); setNewPB({ exercise_name: "", weight: "", reps: "", date: "" }); }}>
                Cancel
              </button>
              <button
                style={{ ...p.ghostBtn, background: "var(--accent)", color: "#0a1420", border: "none", opacity: (!newPB.exercise_name.trim() || !newPB.weight || !newPB.date || savingPB) ? 0.5 : 1 }}
                disabled={!newPB.exercise_name.trim() || !newPB.weight || !newPB.date || savingPB}
                onClick={async () => {
                  setSavingPB(true);
                  try {
                    const created = await createManualPB({
                      athleteId,
                      exerciseName: newPB.exercise_name.trim(),
                      weightKg: parseFloat(newPB.weight) || null,
                      reps: parseInt(newPB.reps) || null,
                      date: newPB.date,
                    });
                    setPbs(prev => [...prev, { id: created.id, exercise_name: created.exercise_name, weight_kg: created.weight_kg ?? 0, reps: created.reps, date: created.date }].sort((a, b) => b.weight_kg - a.weight_kg));
                    setAddingPB(false);
                    setNewPB({ exercise_name: "", weight: "", reps: "", date: "" });
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not create PB");
                  } finally {
                    setSavingPB(false);
                  }
                }}
              >
                {savingPB ? "Saving…" : "Save PB"}
              </button>
            </div>
          </div>
        )}

        {pbs.length === 0 ? (
          <div style={p.empty}>
            No PBs recorded yet. They appear automatically when athletes log heavier weights.
          </div>
        ) : (
          <div style={p.pbList}>
            {pbs.map((pb) => {
              const isExpanded = expandedExercise === pb.exercise_name;
              const chartPoints = progressData[pb.exercise_name];
              const isEditing = editingPB === pb.exercise_name;
              return (
                <div key={pb.exercise_name} style={p.pbCard}>
                  {isEditing ? (
                    /* Edit mode */
                    <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 2 }}>{pb.exercise_name}</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={p.editLabel}>Weight (kg)</div>
                          <input
                            value={editValues.weight}
                            onChange={e => setEditValues(v => ({ ...v, weight: e.target.value }))}
                            style={p.editInput}
                            inputMode="decimal"
                            autoFocus
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={p.editLabel}>Reps</div>
                          <input
                            value={editValues.reps}
                            onChange={e => setEditValues(v => ({ ...v, reps: e.target.value }))}
                            style={p.editInput}
                            inputMode="numeric"
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={p.editLabel}>Date</div>
                          <input
                            type="date"
                            value={editValues.date}
                            onChange={e => setEditValues(v => ({ ...v, date: e.target.value }))}
                            style={p.editInput}
                          />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button
                          style={{ ...p.dangerBtn, fontSize: 12, padding: "5px 10px" }}
                          onClick={async () => {
                            if (!pb.id) return;
                            if (!confirm(`Delete PB for ${pb.exercise_name}? This cannot be undone.`)) return;
                            try {
                              await deletePB(pb.id);
                              setPbs(prev => prev.filter(r => r.exercise_name !== pb.exercise_name));
                              setEditingPB(null);
                            } catch (e) {
                              setError(e instanceof Error ? e.message : "Could not delete PB");
                            }
                          }}
                        >
                          Delete PB
                        </button>
                        <button style={p.ghostBtn} onClick={() => setEditingPB(null)}>Cancel</button>
                        <button
                          style={{ ...p.ghostBtn, background: "var(--accent)", color: "#0a1420", border: "none", opacity: savingPB ? 0.5 : 1 }}
                          disabled={savingPB}
                          onClick={async () => {
                            if (!pb.id) return;
                            setSavingPB(true);
                            try {
                              const wKg = parseFloat(editValues.weight);
                              const reps = parseInt(editValues.reps) || null;
                              await updatePB(pb.id, {
                                weight_kg: isNaN(wKg) ? null : wKg,
                                reps,
                                date: editValues.date || pb.date,
                              });
                              setPbs(prev => prev.map(r =>
                                r.exercise_name === pb.exercise_name
                                  ? { ...r, weight_kg: isNaN(wKg) ? r.weight_kg : wKg, reps, date: editValues.date || r.date }
                                  : r
                              ));
                              setEditingPB(null);
                            } catch (e) {
                              setError(e instanceof Error ? e.message : "Could not update PB");
                            } finally {
                              setSavingPB(false);
                            }
                          }}
                        >
                          {savingPB ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* View mode */
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <button
                        style={{ ...p.pbCardBtn, flex: 1 }}
                        onClick={() => loadProgressForExercise(pb.exercise_name)}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={p.pbExercise}>{pb.exercise_name}</div>
                          <div style={p.pbDate}>{formatDate(pb.date)}</div>
                        </div>
                        <div style={p.pbWeightGroup}>
                          <div style={p.pbWeight}>{pb.weight_kg}kg</div>
                          {pb.reps && <div style={p.pbReps}>× {pb.reps}</div>}
                        </div>
                        <div style={{ ...p.chevron, transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>▾</div>
                      </button>
                      <button
                        style={{ background: "transparent", border: "none", color: "var(--mute)", cursor: "pointer", padding: "0 14px", fontSize: 14 }}
                        title="Edit this PB"
                        onClick={() => {
                          setEditingPB(pb.exercise_name);
                          setEditValues({ weight: String(pb.weight_kg ?? ""), reps: String(pb.reps ?? ""), date: pb.date });
                          setExpandedExercise(null);
                        }}
                      >
                        ✎
                      </button>
                    </div>
                  )}

                  {!isEditing && isExpanded && (
                    <div style={p.chartArea}>
                      {progressLoading && !chartPoints ? (
                        <div style={p.chartLoading}>Loading history…</div>
                      ) : (
                        <ProgressChart
                          points={chartPoints ?? []}
                          exerciseName={pb.exercise_name}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {exportOpen && (
        <ExportModal
          mode="single"
          athleteId={athleteId}
          athleteName={athlete?.name}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const p: Record<string, React.CSSProperties> = {
  page: { maxWidth: 700, margin: "0 auto" },
  loading: { fontSize: 14, color: "var(--mute)", padding: 24 },
  backRow: { marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" },
  backBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "7px 14px", fontSize: 13, cursor: "pointer" },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  dangerBtn: { background: "transparent", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 16 },
  header: { display: "flex", alignItems: "center", gap: 16, marginBottom: 24 },
  avatar: { width: 56, height: 56, borderRadius: "50%", background: "var(--accent-dim)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, flexShrink: 0 },
  name: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, color: "var(--text)", margin: 0 },
  group: { fontSize: 13, color: "var(--mute)", marginTop: 2 },
  since: { fontSize: 12, color: "var(--mute)", marginTop: 2 },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 28 },
  statCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "16px 12px", textAlign: "center" },
  statNum: { fontSize: 26, fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" },
  statLabel: { fontSize: 10, color: "var(--mute)", fontWeight: 600, textTransform: "uppercase", marginTop: 4, letterSpacing: "0.04em" },
  checkinCard: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 16 },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 4 },
  sectionHint: { fontSize: 12, color: "var(--mute)", margin: "0 0 12px" },
  empty: { fontSize: 13, color: "var(--mute)", fontStyle: "italic" },
  pbList: { display: "flex", flexDirection: "column", gap: 8 },
  pbCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" },
  pbCardBtn: { width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" },
  pbExercise: { fontSize: 14, fontWeight: 700, color: "var(--text)" },
  pbDate: { fontSize: 11, color: "var(--mute)", marginTop: 2 },
  pbWeightGroup: { marginLeft: "auto", textAlign: "right" },
  pbWeight: { fontSize: 20, fontWeight: 700, color: "var(--accent)" },
  pbReps: { fontSize: 11, color: "var(--mute)" },
  chevron: { fontSize: 16, color: "var(--mute)", transition: "transform 0.2s", flexShrink: 0 },
  chartArea: { borderTop: "1px solid var(--line)", padding: "12px 14px", background: "var(--ink)" },
  chartLoading: { fontSize: 13, color: "var(--mute)", textAlign: "center", padding: 8 },
  editInput: {
    width: "100%", background: "var(--ink)", border: "1px solid var(--line)",
    color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit",
  },
  editLabel: { fontSize: 10, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 3 },
  pbNameDropdown: {
    position: "absolute" as const, top: "100%", left: 0, right: 0, marginTop: 4,
    background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8,
    zIndex: 20, maxHeight: 200, overflowY: "auto" as const,
  },
  pbNameDropdownItem: {
    width: "100%", textAlign: "left" as const, padding: "8px 10px", background: "transparent",
    border: "none", borderBottom: "1px solid var(--line)", color: "var(--text)", fontSize: 13, cursor: "pointer",
  },
};

const c: Record<string, React.CSSProperties> = {
  chartWrap: { display: "flex", flexDirection: "column", gap: 6 },
  chartTitle: { fontSize: 11, color: "var(--mute)", fontWeight: 600, textTransform: "uppercase" },
  noChart: { fontSize: 12, color: "var(--mute)", fontStyle: "italic", textAlign: "center", padding: 8 },
};

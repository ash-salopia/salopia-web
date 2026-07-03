"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import {
  listTestBatteries, listTestMetrics, listTestSessions, listBenchmarksForMetric,
  createTestSession, saveTrials, deleteTestSession,
} from "@/lib/data/testing";
import TestReportModal from "@/components/TestReportModal";
import type { Athlete, TestBattery, TestMetric, TestBenchmark, TestSession } from "@/types";
import { todayISO } from "@/lib/date-utils";

function calcAgeAtDate(dob: string | null, testDate: string): number | null {
  if (!dob) return null;
  const d = new Date(dob + "T00:00:00Z");
  const t = new Date(testDate + "T00:00:00Z");
  let age = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
  return age;
}

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function AthleteTestingPage() {
  const params = useParams();
  const router = useRouter();
  const athleteId = params?.id as string;

  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [batteries, setBatteries] = useState<TestBattery[]>([]);
  const [metrics, setMetrics] = useState<TestMetric[]>([]);
  const [sessions, setSessions] = useState<TestSession[]>([]);
  const [benchmarksByMetric, setBenchmarksByMetric] = useState<Record<string, TestBenchmark[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [showLog, setShowLog] = useState(false);

  // Log new session form state
  const [logBatteryId, setLogBatteryId] = useState<string | null>(null);
  const [logDate, setLogDate] = useState(todayISO());
  const [logBodyweight, setLogBodyweight] = useState<string>("");
  const [logAge, setLogAge] = useState<string>("");
  const [logNotes, setLogNotes] = useState("");
  const [logResults, setLogResults] = useState<Record<string, { left: string[]; right: string[]; single: string[] }>>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const [athleteRes, b, m, s] = await Promise.all([
        supabase.from("athletes").select("*").eq("id", athleteId).single(),
        listTestBatteries(),
        listTestMetrics(),
        listTestSessions(athleteId),
      ]);
      if (athleteRes.error) throw athleteRes.error;
      setAthlete(athleteRes.data);
      setBatteries(b);
      setMetrics(m);
      setSessions(s);
      if (b.length > 0 && !logBatteryId) setLogBatteryId(b[0].id);

      // Fetch benchmarks for all metrics
      const bmEntries = await Promise.all(
        m.map(async (metric) => [metric.id, await listBenchmarksForMetric(metric.id)] as const)
      );
      setBenchmarksByMetric(Object.fromEntries(bmEntries));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load testing data");
    } finally {
      setLoading(false);
    }
  }, [athleteId]);

  useEffect(() => { load(); }, [load]);

  // Reset log form results when battery changes
  useEffect(() => {
    setLogResults({});
  }, [logBatteryId]);

  const selectedBattery = batteries.find((b) => b.id === logBatteryId);
  const batteryMetrics = selectedBattery?.metrics ?? [];

  const handleSaveSession = async () => {
    if (!logDate) return;
    setSaving(true);
    setError("");
    try {
      const session = await createTestSession({
        athleteId,
        testBatteryId: logBatteryId,
        date: logDate,
        bodyweightKg: logBodyweight ? parseFloat(logBodyweight) : null,
        notes: logNotes,
      });

      // Save results for each metric
      for (const metric of batteryMetrics) {
        const res = logResults[metric.id];
        if (!res) continue;

        if (metric.is_bilateral) {
          const leftVals = res.left.map((v) => parseFloat(v)).filter((v) => !isNaN(v));
          const rightVals = res.right.map((v) => parseFloat(v)).filter((v) => !isNaN(v));
          if (leftVals.length > 0) await saveTrials({ testSessionId: session.id, testMetricId: metric.id, side: "left", values: leftVals });
          if (rightVals.length > 0) await saveTrials({ testSessionId: session.id, testMetricId: metric.id, side: "right", values: rightVals });
        } else {
          const vals = res.single.map((v) => parseFloat(v)).filter((v) => !isNaN(v));
          if (vals.length > 0) await saveTrials({ testSessionId: session.id, testMetricId: metric.id, side: null, values: vals });
        }
      }

      setShowLog(false);
      setLogNotes("");
      setLogResults({});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save session");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteTestSession(sessionId);
      setDeleteConfirm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete session");
    }
  };

  const updateTrialValue = (
    metricId: string,
    side: "left" | "right" | "single",
    trialIdx: number,
    value: string
  ) => {
    setLogResults((prev) => {
      const existing = prev[metricId] ?? { left: [""], right: [""], single: [""] };
      const arr = [...existing[side]];
      arr[trialIdx] = value;
      return { ...prev, [metricId]: { ...existing, [side]: arr } };
    });
  };

  const addTrial = (metricId: string, side: "left" | "right" | "single") => {
    setLogResults((prev) => {
      const existing = prev[metricId] ?? { left: [""], right: [""], single: [""] };
      return { ...prev, [metricId]: { ...existing, [side]: [...existing[side], ""] } };
    });
  };

  return (
    <div style={s.page}>
      <button style={s.back} onClick={() => router.push(`/athletes/${athleteId}`)}>
        ← Back to athlete
      </button>

      <div style={s.headRow}>
        <div>
          <h1 style={s.title}>🧪 Testing</h1>
          {athlete && <div style={s.subtitle}>{athlete.name}</div>}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {sessions.length > 0 && (
            <button style={s.ghostBtn} onClick={() => setShowReport(true)}>
              📄 View Report
            </button>
          )}
          <button style={s.primaryBtn} onClick={() => setShowLog(true)}>
            + Log Session
          </button>
        </div>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      {loading ? (
        <div style={s.empty}>Loading…</div>
      ) : sessions.length === 0 ? (
        <div style={s.emptyState}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🧪</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>No test sessions yet</div>
          <div style={{ fontSize: 14, color: "var(--mute)" }}>Log the first session to start tracking progress and generating reports.</div>
          <button style={{ ...s.primaryBtn, marginTop: 16 }} onClick={() => setShowLog(true)}>Log First Session</button>
        </div>
      ) : (
        <div style={s.sessionList}>
          {sessions.map((session) => {
            const battery = batteries.find((b) => b.id === session.test_battery_id);
            const metricsLogged = metrics.filter((m) =>
              (session.results ?? []).some((r) => r.test_metric_id === m.id)
            );
            return (
              <div key={session.id} style={s.sessionCard}>
                <div style={s.sessionCardTop}>
                  <div>
                    <div style={s.sessionDate}>{fmtDate(session.date)}</div>
                    {battery && <div style={s.sessionBattery}>{battery.name}</div>}
                    {session.bodyweight_kg && (
                      <div style={s.sessionMeta}>⚖️ {session.bodyweight_kg}kg bodyweight</div>
                    )}
                    {athlete?.date_of_birth && (
                      <div style={s.sessionMeta}>🎂 Age at test: {calcAgeAtDate(athlete.date_of_birth, session.date)}</div>
                    )}
                    {session.notes && <div style={s.sessionMeta}>{session.notes}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    {deleteConfirm === session.id ? (
                      <>
                        <button style={s.dangerBtn} onClick={() => handleDeleteSession(session.id)}>Confirm delete</button>
                        <button style={s.ghostBtn} onClick={() => setDeleteConfirm(null)}>Cancel</button>
                      </>
                    ) : (
                      <button style={s.ghostBtn} onClick={() => setDeleteConfirm(session.id)}>🗑</button>
                    )}
                  </div>
                </div>
                {metricsLogged.length > 0 && (
                  <div style={s.metricChips}>
                    {metricsLogged.map((m) => (
                      <span key={m.id} style={s.chip}>{m.name}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Log session modal */}
      {showLog && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <div style={s.modalTitle}>Log Test Session</div>
              <button style={s.closeBtn} onClick={() => setShowLog(false)}>✕</button>
            </div>

            <div style={s.field}>
              <label style={s.label}>Battery</label>
              <select
                style={s.select}
                value={logBatteryId ?? ""}
                onChange={(e) => setLogBatteryId(e.target.value || null)}
              >
                <option value="">— No battery —</option>
                {batteries.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div style={s.field}>
              <label style={s.label}>Date</label>
              <input type="date" style={s.input} value={logDate} onChange={(e) => setLogDate(e.target.value)} />
            </div>

            <div style={s.field}>
              <label style={s.label}>Bodyweight (kg) — required for IMTP relative strength</label>
              <input
                type="number"
                step="0.1"
                placeholder={athlete?.bodyweight_kg ? String(athlete.bodyweight_kg) : "e.g. 68.5"}
                style={s.input}
                value={logBodyweight}
                onChange={(e) => setLogBodyweight(e.target.value)}
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>Age at test date — auto from DOB, or enter manually</label>
              <input
                type="number"
                step="1"
                min="5"
                max="100"
                placeholder={athlete?.date_of_birth ? String(calcAgeAtDate(athlete.date_of_birth, logDate) ?? "") : "e.g. 14"}
                style={s.input}
                value={logAge}
                onChange={(e) => setLogAge(e.target.value)}
              />
              {athlete?.date_of_birth && !logAge && (
                <div style={{ fontSize: 11, color: "var(--mute)", marginTop: 3 }}>
                  Auto-calculated: age {calcAgeAtDate(athlete.date_of_birth, logDate)} from DOB {athlete.date_of_birth}
                </div>
              )}
            </div>

            <div style={s.field}>
              <label style={s.label}>Notes</label>
              <textarea style={s.textarea} value={logNotes} onChange={(e) => setLogNotes(e.target.value)} rows={2} placeholder="Fatigue, conditions, etc." />
            </div>

            {batteryMetrics.length > 0 && (
              <div style={s.metricsSection}>
                <div style={s.metricsSectionTitle}>Results</div>
                {batteryMetrics.map((metric) => {
                  const res = logResults[metric.id] ?? { left: [""], right: [""], single: [""] };
                  return (
                    <div key={metric.id} style={s.metricBlock}>
                      <div style={s.metricName}>
                        {metric.name}
                        <span style={s.metricUnit}> ({metric.unit})</span>
                        {metric.screening_only && <span style={s.screeningTag}> SCREEN</span>}
                      </div>
                      {metric.is_bilateral ? (
                        <div style={{ display: "flex", gap: 12 }}>
                          {(["left", "right"] as const).map((side) => (
                            <div key={side} style={{ flex: 1 }}>
                              <div style={s.sideLabel}>{side === "left" ? "Left" : "Right"}</div>
                              {res[side].map((v, i) => (
                                <input
                                  key={i}
                                  type="number"
                                  step="any"
                                  placeholder={`Trial ${i + 1}`}
                                  style={s.trialInput}
                                  value={v}
                                  onChange={(e) => updateTrialValue(metric.id, side, i, e.target.value)}
                                />
                              ))}
                              <button style={s.addTrialBtn} onClick={() => addTrial(metric.id, side)}>+ trial</button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div>
                          {res.single.map((v, i) => (
                            <input
                              key={i}
                              type="number"
                              step="any"
                              placeholder={`Trial ${i + 1}`}
                              style={s.trialInput}
                              value={v}
                              onChange={(e) => updateTrialValue(metric.id, "single", i, e.target.value)}
                            />
                          ))}
                          <button style={s.addTrialBtn} onClick={() => addTrial(metric.id, "single")}>+ trial</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {error && <div style={s.errorBox}>{error}</div>}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <button style={s.ghostBtn} onClick={() => setShowLog(false)}>Cancel</button>
              <button style={{ ...s.primaryBtn, opacity: saving ? 0.6 : 1 }} disabled={saving || !logDate} onClick={handleSaveSession}>
                {saving ? "Saving…" : "Save Session"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report modal */}
      {showReport && athlete && sessions.length > 0 && (
        <TestReportModal
          athlete={athlete}
          sessions={sessions}
          metrics={metrics}
          benchmarksByMetric={benchmarksByMetric}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: "24px 20px", maxWidth: 720, margin: "0 auto" },
  back: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 20, display: "flex", alignItems: "center", gap: 4 },
  headRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 12, flexWrap: "wrap" },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, color: "var(--text)", margin: 0 },
  subtitle: { fontSize: 14, color: "var(--mute)", marginTop: 2 },
  primaryBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  dangerBtn: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 },
  empty: { fontSize: 14, color: "var(--mute)", padding: "24px 0" },
  emptyState: { textAlign: "center", padding: "48px 20px" },
  sessionList: { display: "flex", flexDirection: "column", gap: 12 },
  sessionCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16 },
  sessionCardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  sessionDate: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  sessionBattery: { fontSize: 13, color: "var(--accent)", marginTop: 2, fontWeight: 600 },
  sessionMeta: { fontSize: 12, color: "var(--mute)", marginTop: 4 },
  metricChips: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 },
  chip: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "var(--mute)" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontWeight: 700, color: "var(--text)" },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 20, cursor: "pointer" },
  field: { display: "flex", flexDirection: "column", gap: 5 },
  label: { fontSize: 12, fontWeight: 600, color: "var(--mute)" },
  input: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14 },
  select: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14 },
  textarea: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 13, resize: "vertical" as const },
  metricsSection: { display: "flex", flexDirection: "column", gap: 14, marginTop: 4 },
  metricsSectionTitle: { fontSize: 13, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.06em" },
  metricBlock: { background: "var(--ink)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 },
  metricName: { fontSize: 14, fontWeight: 700, color: "var(--text)" },
  metricUnit: { fontWeight: 400, color: "var(--mute)" },
  screeningTag: { fontSize: 10, fontWeight: 700, color: "#A855F7", background: "#A855F720", borderRadius: 4, padding: "1px 5px" },
  sideLabel: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", marginBottom: 4 },
  trialInput: { background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6, padding: "6px 10px", fontSize: 13, width: "100%", boxSizing: "border-box" as const, marginBottom: 4 },
  addTrialBtn: { background: "transparent", border: "1px dashed var(--line)", color: "var(--mute)", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", marginTop: 2 },
};

"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getGroupTestSession, addAthletesToGroupTestSession, removeGroupTestAthlete,
  updateGroupTestSession, listBenchmarksForMetric,
  ageInYears, matchBothBenchmarks, ragStatus, RAG_COLOR,
  type GroupTestSessionDetail, type GroupTestAthlete,
} from "@/lib/data/testing";
import { listAthletes } from "@/lib/data/athletes";
import { getOrganisationBilling } from "@/lib/data/billing";
import { getMyBranding } from "@/lib/data/branding";
import { planReportCapabilities, type ReportCapability } from "@/lib/billing/entitlements";
import GroupTestReports from "@/components/GroupTestReports";
import {
  saveWithRetry, flushSaveQueue, initSaveQueue, usePendingSaveCount, useFailedSaveCount,
} from "@/lib/save-queue";
import { DEFAULT_BRANDING, type ResolvedBranding } from "@/types/branding";
import type { Athlete, TestBenchmark, TestMetric } from "@/types";

const SAVE_URL = "/api/group-testing/cell";
const DEBOUNCE_MS = 400;
// Stable identity for an empty cell so React.memo can skip untouched cells.
const EMPTY_TRIALS: string[] = [""];

type CellStatus = "saving" | "saved" | "pending" | "error";
type Side = "left" | "right" | null;

interface Col {
  key: string;
  metric: TestMetric;
  side: Side;
  label: string;
}

function cellKey(sessionId: string, metricId: string, side: Side) {
  return `${sessionId}::${metricId}::${side ?? ""}`;
}
function saveKey(sessionId: string, metricId: string, side: Side) {
  return `grouptest:${cellKey(sessionId, metricId, side)}`;
}
function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function bestTrialIdx(vals: string[], dir: "higher" | "lower"): number {
  let bi = -1;
  let bv: number | null = null;
  vals.forEach((v, i) => {
    const n = parseFloat(v);
    if (!isFinite(n)) return;
    if (bv === null || (dir === "lower" ? n < bv : n > bv)) { bv = n; bi = i; }
  });
  return bi;
}

export default function GroupTestGridPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [detail, setDetail] = useState<GroupTestSessionDetail | null>(null);
  const [benchmarksByMetric, setBenchmarksByMetric] = useState<Record<string, TestBenchmark[]>>({});
  const [values, setValues] = useState<Record<string, string[]>>({});
  const valuesRef = useRef(values);
  useEffect(() => { valuesRef.current = values; }, [values]);
  const [bw, setBw] = useState<Record<string, string>>({});
  const [cellStatus, setCellStatus] = useState<Record<string, CellStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [branding, setBranding] = useState<ResolvedBranding>(DEFAULT_BRANDING);
  const [capabilities, setCapabilities] = useState<Set<ReportCapability>>(() => planReportCapabilities("trial"));

  const pending = usePendingSaveCount();
  const failed = useFailedSaveCount();

  // key -> pending debounce timer
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // key -> the latest body waiting to be flushed
  const pendingBodies = useRef<Map<string, Record<string, unknown>>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const d = await getGroupTestSession(id);
      setDetail(d);
      setName(d.groupSession.name);

      const initVals: Record<string, string[]> = {};
      const initBw: Record<string, string> = {};
      for (const s of d.sessions) {
        initBw[s.id] = s.bodyweight_kg != null ? String(s.bodyweight_kg) : "";
        for (const r of s.results ?? []) {
          const k = cellKey(s.id, r.test_metric_id, (r.side ?? null) as Side);
          (initVals[k] ??= []);
        }
        // fill in trial order
        for (const r of (s.results ?? []).slice().sort((a, b) => a.trial_number - b.trial_number)) {
          const k = cellKey(s.id, r.test_metric_id, (r.side ?? null) as Side);
          initVals[k].push(String(r.value));
        }
      }
      setValues(initVals);
      setBw(initBw);

      const metrics = d.battery?.metrics ?? [];
      const entries = await Promise.all(
        metrics.map(async (m) => [m.id, await listBenchmarksForMetric(m.id)] as const)
      );
      setBenchmarksByMetric(Object.fromEntries(entries));

      // Branding + plan for the Reports menu (non-fatal if either fails).
      getMyBranding().then(setBranding).catch(() => {});
      getOrganisationBilling()
        .then((b) => setCapabilities(planReportCapabilities(b.plan)))
        .catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load group session");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { initSaveQueue(); }, []);

  // Flush every pending debounced save (used on unmount / tab hide / unload).
  const flushAll = useCallback(() => {
    for (const [key, timer] of timers.current.entries()) {
      clearTimeout(timer);
      const body = pendingBodies.current.get(key);
      if (body) void doSave(key, body);
    }
    timers.current.clear();
    pendingBodies.current.clear();
    void flushSaveQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flushAll(); };
    window.addEventListener("beforeunload", flushAll);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", flushAll);
      document.removeEventListener("visibilitychange", onHide);
      flushAll();
    };
  }, [flushAll]);

  async function doSave(key: string, body: Record<string, unknown>) {
    pendingBodies.current.delete(key);
    setCellStatus((p) => ({ ...p, [key]: "saving" }));
    const r = await saveWithRetry(key, SAVE_URL, body);
    setCellStatus((p) => ({
      ...p,
      [key]: r.ok ? "saved" : r.queued ? "pending" : "error",
    }));
  }

  const scheduleSave = useCallback((key: string, body: Record<string, unknown>) => {
    pendingBodies.current.set(key, body);
    const existing = timers.current.get(key);
    if (existing) clearTimeout(existing);
    timers.current.set(
      key,
      setTimeout(() => {
        timers.current.delete(key);
        const b = pendingBodies.current.get(key);
        if (b) void doSave(key, b);
      }, DEBOUNCE_MS)
    );
  }, []);

  const flushKey = useCallback((key: string) => {
    const t = timers.current.get(key);
    if (t) {
      clearTimeout(t);
      timers.current.delete(key);
      const b = pendingBodies.current.get(key);
      if (b) void doSave(key, b);
    }
  }, []);

  // ── Cell handlers ──────────────────────────────────────────────────────────
  const saveTrialsCell = useCallback((sessionId: string, metricId: string, side: Side, arr: string[], immediate = false) => {
    const sk = saveKey(sessionId, metricId, side);
    const body = { kind: "trials", testSessionId: sessionId, testMetricId: metricId, side, values: arr };
    scheduleSave(sk, body);
    if (immediate) flushKey(sk);
  }, [scheduleSave, flushKey]);

  const onTrialChange = useCallback((sessionId: string, metricId: string, side: Side, idx: number, val: string) => {
    const k = cellKey(sessionId, metricId, side);
    const arr = (valuesRef.current[k] ?? [""]).slice();
    arr[idx] = val;
    setValues((prev) => ({ ...prev, [k]: arr }));
    saveTrialsCell(sessionId, metricId, side, arr);
  }, [saveTrialsCell]);

  const onTrialBlur = useCallback((sessionId: string, metricId: string, side: Side) => {
    flushKey(saveKey(sessionId, metricId, side));
  }, [flushKey]);

  const addTrial = useCallback((sessionId: string, metricId: string, side: Side) => {
    const k = cellKey(sessionId, metricId, side);
    const arr = [...(valuesRef.current[k] ?? [""]), ""];
    setValues((prev) => ({ ...prev, [k]: arr }));
  }, []);

  const removeTrial = useCallback((sessionId: string, metricId: string, side: Side) => {
    const k = cellKey(sessionId, metricId, side);
    const arr = (valuesRef.current[k] ?? [""]).slice();
    if (arr.length <= 1) return;
    arr.pop();
    setValues((prev) => ({ ...prev, [k]: arr }));
    saveTrialsCell(sessionId, metricId, side, arr, true);
  }, [saveTrialsCell]);

  const onBwChange = useCallback((sessionId: string, val: string) => {
    setBw((prev) => ({ ...prev, [sessionId]: val }));
    scheduleSave(`grouptest:bw:${sessionId}`, { kind: "bodyweight", testSessionId: sessionId, bodyweightKg: val });
  }, [scheduleSave]);

  const onBwBlur = useCallback((sessionId: string) => flushKey(`grouptest:bw:${sessionId}`), [flushKey]);

  // ── Session meta ───────────────────────────────────────────────────────────
  const saveName = async () => {
    if (!detail || name === detail.groupSession.name) return;
    try {
      await updateGroupTestSession(id, { name: name.trim() });
      setDetail((d) => d && { ...d, groupSession: { ...d.groupSession, name: name.trim() } });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not rename"); }
  };
  const saveDate = async (date: string) => {
    try {
      await updateGroupTestSession(id, { date });
      setDetail((d) => d && { ...d, groupSession: { ...d.groupSession, date } });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update date"); }
  };

  const removeAthlete = async (sessionId: string, athleteName: string) => {
    if (!confirm(`Remove ${athleteName} from this group session? Their values in this session are deleted.`)) return;
    try {
      await removeGroupTestAthlete(sessionId);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not remove athlete"); }
  };

  const cols: Col[] = useMemo(() => {
    const metrics = detail?.battery?.metrics ?? [];
    return metrics.flatMap((m) =>
      m.is_bilateral
        ? [
            { key: `${m.id}:L`, metric: m, side: "left" as Side, label: `${m.name} — L` },
            { key: `${m.id}:R`, metric: m, side: "right" as Side, label: `${m.name} — R` },
          ]
        : [{ key: m.id, metric: m, side: null as Side, label: m.name }]
    );
  }, [detail]);

  const anySaving = Object.values(cellStatus).some((s) => s === "saving");

  if (loading) return <div style={st.pad}>Loading…</div>;
  if (error && !detail) return <div style={st.pad}><div style={st.errorBox}>{error}</div></div>;
  if (!detail) return null;

  const { groupSession, battery, sessions, athletes } = detail;
  const athleteById = new Map(athletes.map((a) => [a.id, a]));

  return (
    <div style={st.page}>
      <button style={st.back} onClick={() => { flushAll(); router.push("/testing"); }}>← Testing</button>

      <div style={st.headRow}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            style={st.nameInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            placeholder={`Testing — ${fmtDate(groupSession.date)}`}
          />
          <div style={st.subMeta}>
            <input type="date" style={st.dateInput} value={groupSession.date} onChange={(e) => saveDate(e.target.value)} />
            <span>{battery ? battery.name : "No battery"}</span>
            <span>· {sessions.length} athlete{sessions.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <SaveBanner anySaving={anySaving} pending={pending} failed={failed} />
          {sessions.length > 0 && (
            <GroupTestReports
              groupSession={groupSession}
              sessions={sessions}
              athletes={athletes}
              branding={branding}
              capabilities={capabilities}
            />
          )}
          <button style={st.ghostBtn} onClick={() => setAddOpen(true)}>+ Add athletes</button>
          <button style={st.primaryBtn} onClick={() => { flushAll(); router.push("/testing"); }}>Done</button>
        </div>
      </div>

      {error && <div style={st.errorBox}>{error}</div>}

      {!battery || cols.length === 0 ? (
        <div style={st.empty}>
          This session&apos;s battery has no metrics. Add some in the Batteries tab, then reopen.
        </div>
      ) : sessions.length === 0 ? (
        <div style={st.empty}>No athletes in this session yet — use “+ Add athletes”.</div>
      ) : (
        <div style={st.scroll}>
          <table style={st.table}>
            <thead>
              <tr>
                <th style={{ ...st.th, ...st.cornerName }}>Athlete</th>
                <th style={{ ...st.th, ...st.cornerBw }}>BW (kg)</th>
                {cols.map((c) => (
                  <th key={c.key} style={{ ...st.th, ...st.colHead }}>
                    <div style={st.colHeadName}>{c.label}</div>
                    <div style={st.colHeadUnit}>{c.metric.unit || "—"}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const a = athleteById.get(s.athlete_id);
                const age = a ? ageInYears(a.date_of_birth, groupSession.date) : null;
                return (
                  <tr key={s.id}>
                    <td style={{ ...st.td, ...st.nameCell }}>
                      <div style={st.nameCellInner}>
                        <span style={st.athleteName}>{a?.name ?? "Athlete"}</span>
                        <button style={st.removeBtn} title="Remove from session" onClick={() => removeAthlete(s.id, a?.name ?? "athlete")}>✕</button>
                      </div>
                    </td>
                    <td style={{ ...st.td, ...st.bwCell }}>
                      <input
                        style={st.bwInput}
                        inputMode="decimal"
                        value={bw[s.id] ?? ""}
                        onChange={(e) => onBwChange(s.id, e.target.value)}
                        onBlur={() => onBwBlur(s.id)}
                      />
                    </td>
                    {cols.map((c) => {
                      const k = cellKey(s.id, c.metric.id, c.side);
                      const trials = values[k] ?? EMPTY_TRIALS;
                      const rag = ragForCell(trials, c.metric, benchmarksByMetric[c.metric.id] ?? [], a ?? null, age);
                      return (
                        <Cell
                          key={c.key}
                          sessionId={s.id}
                          metricId={c.metric.id}
                          side={c.side}
                          trials={trials}
                          status={cellStatus[saveKey(s.id, c.metric.id, c.side)]}
                          dir={c.metric.better_direction}
                          ragColor={rag}
                          onChange={onTrialChange}
                          onBlur={onTrialBlur}
                          onAdd={addTrial}
                          onRemove={removeTrial}
                        />
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <AddAthletesModal
          currentAthleteIds={new Set(sessions.map((s) => s.athlete_id))}
          onClose={() => setAddOpen(false)}
          onAdd={async (picked) => {
            await addAthletesToGroupTestSession(id, picked.map((p) => ({ id: p.id, bodyweightKg: p.bodyweight_kg })));
            setAddOpen(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

// ── RAG for a cell (elite rating on the best trial) ───────────────────────────
function ragForCell(
  trials: string[],
  metric: TestMetric,
  benchmarks: TestBenchmark[],
  athlete: GroupTestAthlete | null,
  age: number | null
): string | null {
  if (metric.screening_only || !athlete) return null;
  const idx = bestTrialIdx(trials, metric.better_direction);
  if (idx < 0) return null;
  const best = parseFloat(trials[idx]);
  if (!isFinite(best)) return null;
  const { elite } = matchBothBenchmarks(benchmarks, athlete.sex, age);
  if (!elite) return null;
  return RAG_COLOR[ragStatus(best, metric, elite)];
}

// ── Cell ─────────────────────────────────────────────────────────────────────
interface CellProps {
  sessionId: string;
  metricId: string;
  side: Side;
  trials: string[];
  status: CellStatus | undefined;
  dir: "higher" | "lower";
  ragColor: string | null;
  onChange: (sessionId: string, metricId: string, side: Side, idx: number, v: string) => void;
  onBlur: (sessionId: string, metricId: string, side: Side) => void;
  onAdd: (sessionId: string, metricId: string, side: Side) => void;
  onRemove: (sessionId: string, metricId: string, side: Side) => void;
}

const Cell = React.memo(function Cell({
  sessionId, metricId, side, trials, status, dir, ragColor, onChange, onBlur, onAdd, onRemove,
}: CellProps) {
  const best = bestTrialIdx(trials, dir);
  return (
    <td style={{ ...st.td, ...st.cell, borderLeft: ragColor ? `3px solid ${ragColor}` : "3px solid transparent" }}>
      <div style={st.cellInner}>
        {trials.map((v, i) => (
          <input
            key={i}
            style={{ ...st.trialInput, ...(i === best && trials.length > 1 ? st.trialBest : {}) }}
            inputMode="decimal"
            value={v}
            onChange={(e) => onChange(sessionId, metricId, side, i, e.target.value)}
            onBlur={() => onBlur(sessionId, metricId, side)}
          />
        ))}
        <div style={st.cellFoot}>
          <button style={st.trialBtn} title="Add trial" onClick={() => onAdd(sessionId, metricId, side)}>＋</button>
          {trials.length > 1 && (
            <button style={st.trialBtn} title="Remove last trial" onClick={() => onRemove(sessionId, metricId, side)}>－</button>
          )}
          <span style={st.cellStatus}>{statusGlyph(status)}</span>
        </div>
      </div>
    </td>
  );
});

function statusGlyph(s: CellStatus | undefined): string {
  if (s === "saving") return "⟳";
  if (s === "saved") return "✓";
  if (s === "pending") return "⧗";
  if (s === "error") return "⚠";
  return "";
}

// ── Save banner ──────────────────────────────────────────────────────────────
function SaveBanner({ anySaving, pending, failed }: { anySaving: boolean; pending: number; failed: number }) {
  let text = "All changes saved";
  let color = "var(--good, #2E9E5B)";
  if (failed > 0) { text = `${failed} didn’t save`; color = "#E53935"; }
  else if (pending > 0) { text = `${pending} unsaved — will retry`; color = "#FB8C00"; }
  else if (anySaving) { text = "Saving…"; color = "var(--mute)"; }
  return <span style={{ ...st.banner, color, borderColor: color }}>{text}</span>;
}

// ── Add athletes modal ───────────────────────────────────────────────────────
function AddAthletesModal({ currentAthleteIds, onClose, onAdd }: {
  currentAthleteIds: Set<string>;
  onClose: () => void;
  onAdd: (picked: Athlete[]) => Promise<void>;
}) {
  const [allAthletes, setAllAthletes] = useState<Athlete[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listAthletes().then(setAllAthletes).catch(() => {});
  }, []);

  const athletes = allAthletes.filter((x) => !currentAthleteIds.has(x.id));

  return (
    <div style={st.overlay} onClick={onClose}>
      <div style={st.modal} onClick={(e) => e.stopPropagation()}>
        <div style={st.modalHead}>
          <div style={st.modalTitle}>Add athletes</div>
          <button style={st.closeBtn} onClick={onClose}>✕</button>
        </div>
        {athletes.length === 0 ? (
          <div style={st.empty}>Every active athlete is already in this session.</div>
        ) : (
          <div style={st.modalList}>
            {athletes.map((a) => (
              <label key={a.id} style={st.athleteRow}>
                <input
                  type="checkbox"
                  checked={picked.has(a.id)}
                  onChange={() => setPicked((p) => {
                    const n = new Set(p);
                    n.has(a.id) ? n.delete(a.id) : n.add(a.id);
                    return n;
                  })}
                />
                <span>{a.name}</span>
                {a.group && <span style={st.groupTag}>{a.group}</span>}
              </label>
            ))}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button style={st.ghostBtn} onClick={onClose}>Cancel</button>
          <button
            style={{ ...st.primaryBtn, opacity: picked.size === 0 || busy ? 0.5 : 1 }}
            disabled={picked.size === 0 || busy}
            onClick={async () => { setBusy(true); await onAdd(athletes.filter((a) => picked.has(a.id))); }}
          >
            {busy ? "Adding…" : `Add ${picked.size}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const st: Record<string, React.CSSProperties> = {
  page: { padding: "20px 20px 40px" },
  pad: { padding: 24, color: "var(--mute)" },
  back: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 14 },
  headRow: { display: "flex", gap: 16, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", marginBottom: 14 },
  nameInput: { background: "transparent", border: "1px solid transparent", color: "var(--text)", fontSize: 22, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", padding: "2px 4px", borderRadius: 6, width: "100%", maxWidth: 420 },
  subMeta: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12, color: "var(--mute)", marginTop: 4 },
  dateInput: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6, padding: "4px 8px", fontSize: 12 },
  primaryBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  banner: { fontSize: 11, fontWeight: 700, border: "1px solid", borderRadius: 999, padding: "4px 10px", whiteSpace: "nowrap" },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 },
  empty: { color: "var(--mute)", fontSize: 14, padding: "28px 0" },

  scroll: { overflow: "auto", maxHeight: "calc(100vh - 210px)", border: "1px solid var(--line)", borderRadius: 12 },
  table: { borderCollapse: "separate", borderSpacing: 0, fontSize: 12 },

  th: { background: "var(--ink)", position: "sticky", top: 0, zIndex: 3, padding: "8px 8px", borderBottom: "1px solid var(--line)", borderRight: "1px solid var(--line)", boxSizing: "border-box" },
  colHead: { minWidth: 96, textAlign: "center", verticalAlign: "bottom" },
  colHeadName: { fontWeight: 700, color: "var(--text)", fontSize: 11, lineHeight: 1.2 },
  colHeadUnit: { fontWeight: 400, color: "var(--mute)", fontSize: 10, marginTop: 2 },
  // The two frozen columns. Widths are explicit + border-box so their
  // footprint is exactly NAME_W / BW_W, and bw's `left` lines up with
  // the edge of the name column no matter how wide the content is.
  cornerName: { left: 0, zIndex: 5, textAlign: "left", width: 150, minWidth: 150, maxWidth: 150 },
  cornerBw: { left: 150, zIndex: 5, width: 64, minWidth: 64, maxWidth: 64, textAlign: "center" },

  td: { borderBottom: "1px solid var(--line)", borderRight: "1px solid var(--line)", background: "var(--panel)", boxSizing: "border-box" },
  nameCell: { position: "sticky", left: 0, zIndex: 2, padding: "6px 8px", width: 150, minWidth: 150, maxWidth: 150 },
  nameCellInner: { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" },
  athleteName: { fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  removeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 11, cursor: "pointer", flexShrink: 0 },
  bwCell: { position: "sticky", left: 150, zIndex: 2, padding: 4, width: 64, minWidth: 64, maxWidth: 64 },
  bwInput: { width: "100%", boxSizing: "border-box", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 5, padding: "5px 4px", fontSize: 12, textAlign: "center" },

  cell: { padding: 3, verticalAlign: "top" },
  cellInner: { display: "flex", flexDirection: "column", gap: 3, minWidth: 90 },
  trialInput: { width: "100%", boxSizing: "border-box", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 5, padding: "5px 6px", fontSize: 12, textAlign: "center" },
  trialBest: { borderColor: "var(--accent)", background: "var(--accent-dim, rgba(120,200,255,.12))", fontWeight: 700 },
  cellFoot: { display: "flex", alignItems: "center", gap: 4 },
  trialBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 4, fontSize: 11, lineHeight: 1, padding: "2px 5px", cursor: "pointer" },
  cellStatus: { marginLeft: "auto", fontSize: 11, color: "var(--mute)", width: 12, textAlign: "center" },

  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 420, maxHeight: "80vh", display: "flex", flexDirection: "column" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 18, cursor: "pointer" },
  modalList: { display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: 8 },
  athleteRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)" },
  groupTag: { fontSize: 10, color: "var(--mute)", marginLeft: "auto" },
};

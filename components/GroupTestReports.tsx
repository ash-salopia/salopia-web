"use client";

// "Reports ▾" for a Group Testing session. Three modes, gated by plan
// (lib/billing/entitlements.ts):
//   1 · Athlete reports  — sequential per-athlete Test Report      (Starter+)
//   3 · Squad summary    — one table, athletes × metrics + RAG     (Pro+)
//   2 · Print all        — combined print doc  +  ZIP of PDFs       (Unlimited+)
//
// All rendering is client-side (window.print() / @react-pdf/renderer),
// consistent with every other report in the app — the gate is UI only.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listTestMetrics, listBenchmarksForMetric, listTestSessions,
  buildTestReportView, sortByMetricGroup, RAG_COLOR, RATING_SCOPE_LABEL,
  type GroupTestAthlete, type CompareBasis, type TestReportRatedRow, type RatingScope,
} from "@/lib/data/testing";
import TestReportModal from "@/components/TestReportModal";
import TestReportBody from "@/components/reports/TestReportBody";
import { CAPABILITY_MIN_PLAN, type ReportCapability } from "@/lib/billing/entitlements";
import type { GroupTestSession, TestBenchmark, TestMetric, TestSession } from "@/types";
import { DEFAULT_BRANDING, type ResolvedBranding } from "@/types/branding";

interface Props {
  groupSession: GroupTestSession;
  // Either pass the loaded detail (grid page) …
  sessions?: TestSession[];        // this group's per-athlete test_sessions, with results
  athletes?: GroupTestAthlete[];
  // … or a loader the menu calls on first open (GroupTestingTab card).
  detailLoader?: () => Promise<{ sessions: TestSession[]; athletes: GroupTestAthlete[] }>;
  branding?: ResolvedBranding;
  capabilities: Set<ReportCapability>;
  compact?: boolean;
}

type OpenMode = null | "athlete" | "squad" | "batch";

interface ReportRefData {
  metrics: TestMetric[];
  benchmarksByMetric: Record<string, TestBenchmark[]>;
  histories: Map<string, TestSession[]>;
}

const COMPARE_LABEL: Record<"previous" | "best" | "first", string> = {
  previous: "Previous test",
  best: "Best previous result",
  first: "First test",
};
const COMPARE_SHORT: Record<"previous" | "best" | "first", string> = {
  previous: "Prev",
  best: "Best",
  first: "First",
};

function slug(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Loads every athlete's FULL testing history (not just this session),
// so "change vs previous" works in the reports.
async function loadHistories(athletes: GroupTestAthlete[]): Promise<Map<string, TestSession[]>> {
  const pairs = await Promise.all(
    athletes.map(async (a) => [a.id, await listTestSessions(a.id)] as const)
  );
  return new Map(pairs);
}

export default function GroupTestReports({ groupSession, sessions, athletes, detailLoader, branding = DEFAULT_BRANDING, capabilities, compact }: Props) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [open, setOpen] = useState<OpenMode>(null);
  const [ref, setRef] = useState<ReportRefData | null>(null);
  const [loadingRef, setLoadingRef] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [error, setError] = useState("");
  const [lockedNote, setLockedNote] = useState<ReportCapability | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [detail, setDetail] = useState<{ sessions: TestSession[]; athletes: GroupTestAthlete[] } | null>(
    sessions && athletes ? { sessions, athletes } : null
  );
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [compareTo, setCompareTo] = useState<"previous" | "best" | "first">("previous");
  const [ratingScope, setRatingScope] = useState<RatingScope>("both");

  const openMenu = async () => {
    setMenuOpen((v) => !v);
    if (!detail && detailLoader && !loadingDetail) {
      setLoadingDetail(true);
      try {
        setDetail(await detailLoader());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load session");
      } finally {
        setLoadingDetail(false);
      }
    }
  };

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) { setMenuOpen(false); setLockedNote(null); }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Lazily fetch all metrics + benchmarks + every athlete's full history
  // the first time any report opens. Shared by all four report modes.
  const ensureRef = useCallback(async (): Promise<ReportRefData | null> => {
    if (ref) return ref;
    if (!detail) return null;
    setLoadingRef(true);
    setError("");
    try {
      const [metrics, histories] = await Promise.all([
        listTestMetrics(),
        loadHistories(detail.athletes),
      ]);
      const entries = await Promise.all(
        metrics.map(async (m) => [m.id, await listBenchmarksForMetric(m.id)] as const)
      );
      const data = { metrics, benchmarksByMetric: Object.fromEntries(entries), histories };
      setRef(data);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load report data");
      return null;
    } finally {
      setLoadingRef(false);
    }
  }, [ref, detail]);

  // Report "as of this group session": pin the latest to the group's own
  // per-athlete session, then that athlete's earlier tests behind it.
  const orderedHistory = useCallback((athleteId: string): TestSession[] => {
    const hist = ref?.histories.get(athleteId) ?? [];
    const gs = detail?.sessions.find((s) => s.athlete_id === athleteId);
    return gs ? [gs, ...hist.filter((h) => h.id !== gs.id)] : hist;
  }, [ref, detail]);

  const pick = async (mode: Exclude<OpenMode, null>, cap: ReportCapability) => {
    if (!capabilities.has(cap)) { setLockedNote(cap); return; }
    if (!detail) return;
    setMenuOpen(false);
    setLockedNote(null);
    const data = await ensureRef();
    if (data) setOpen(mode);
  };

  const handleZip = async () => {
    if (!capabilities.has("batch_reports")) { setLockedNote("batch_reports"); return; }
    if (!detail) return;
    setMenuOpen(false);
    const data = await ensureRef();
    if (!data) return;
    const gsAthletes = detail.athletes;
    setZipBusy(true);
    setError("");
    try {
      const [{ pdf }, JSZipMod] = await Promise.all([
        import("@react-pdf/renderer"),
        import("jszip"),
      ]);
      const { default: TestReportPdf } = await import("@/components/reports/pdf/TestReportPdf");
      const JSZip = JSZipMod.default;
      const zip = new JSZip();
      for (const a of gsAthletes) {
        const view = buildTestReportView(a, orderedHistory(a.id), data.metrics, data.benchmarksByMetric, { kind: compareTo });
        const blob = await pdf(
          <TestReportPdf athleteName={a.name} athleteGroup={a.group} athleteSex={a.sex} view={view} ratingScope={ratingScope} branding={branding} />
        ).toBlob();
        zip.file(`${slug(a.name) || "athlete"}-testing-${groupSession.date}.pdf`, blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${slug(groupSession.name) || "group"}-testing-reports-${groupSession.date}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build ZIP");
    } finally {
      setZipBusy(false);
    }
  };

  const items: { key: Exclude<OpenMode, null> | "zip"; label: string; cap: ReportCapability; onClick: () => void }[] = [
    { key: "athlete", label: "Athlete reports", cap: "athlete_reports", onClick: () => pick("athlete", "athlete_reports") },
    { key: "squad", label: "Squad summary", cap: "squad_summary", onClick: () => pick("squad", "squad_summary") },
    { key: "batch", label: "Print all — combined", cap: "batch_reports", onClick: () => pick("batch", "batch_reports") },
    { key: "zip", label: zipBusy ? "Building ZIP…" : "Download all as PDF ZIP", cap: "batch_reports", onClick: handleZip },
  ];

  const busy = zipBusy || loadingDetail || loadingRef;

  return (
    <div ref={menuRef} style={{ position: "relative", display: "inline-block" }}>
      <button style={compact ? st.compactBtn : st.btn} onClick={openMenu}>
        {busy ? "Loading…" : "📄 Reports ▾"}
      </button>

      {menuOpen && (
        <div style={st.menu}>
          {loadingDetail && <div style={st.err}>Loading session…</div>}
          <label style={st.compareRow}>
            <span style={st.compareRowLabel}>Compare to</span>
            <select style={st.compareRowSelect} value={compareTo} onChange={(e) => setCompareTo(e.target.value as typeof compareTo)}>
              {(["previous", "best", "first"] as const).map((k) => (
                <option key={k} value={k}>{COMPARE_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <label style={st.compareRow}>
            <span style={st.compareRowLabel}>Ratings</span>
            <select style={st.compareRowSelect} value={ratingScope} onChange={(e) => setRatingScope(e.target.value as RatingScope)}>
              {(Object.keys(RATING_SCOPE_LABEL) as RatingScope[]).map((k) => (
                <option key={k} value={k}>{RATING_SCOPE_LABEL[k]}</option>
              ))}
            </select>
          </label>
          {items.map((it) => {
            const locked = !capabilities.has(it.cap);
            return (
              <button
                key={it.key}
                style={{ ...st.menuItem, ...(locked ? st.menuItemLocked : {}) }}
                onClick={it.onClick}
                disabled={zipBusy || (!locked && !detail)}
              >
                <span>{it.label}</span>
                {locked && <span style={st.lockTag}>🔒 {CAPABILITY_MIN_PLAN[it.cap]}</span>}
              </button>
            );
          })}
          {lockedNote && (
            <div style={st.upgrade}>
              Needs the <b>{CAPABILITY_MIN_PLAN[lockedNote]}</b> plan.{" "}
              <button style={st.upgradeLink} onClick={() => router.push("/settings")}>Upgrade</button>
            </div>
          )}
          {error && <div style={st.err}>{error}</div>}
        </div>
      )}

      {open === "athlete" && ref && detail && (
        <SequentialViewer
          athletes={detail.athletes}
          historyFor={orderedHistory}
          metrics={ref.metrics}
          benchmarksByMetric={ref.benchmarksByMetric}
          branding={branding}
          initialCompareTo={{ kind: compareTo }}
          initialRatingScope={ratingScope}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "squad" && ref && detail && (
        <SquadSummaryModal
          groupSession={groupSession}
          athletes={detail.athletes}
          historyFor={orderedHistory}
          metrics={ref.metrics}
          benchmarksByMetric={ref.benchmarksByMetric}
          branding={branding}
          compareTo={compareTo}
          ratingScope={ratingScope}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "batch" && ref && detail && (
        <BatchPrint
          athletes={detail.athletes}
          historyFor={orderedHistory}
          metrics={ref.metrics}
          benchmarksByMetric={ref.benchmarksByMetric}
          branding={branding}
          compareTo={{ kind: compareTo }}
          ratingScope={ratingScope}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

// ── 1 · Sequential per-athlete viewer ────────────────────────────────────────
function SequentialViewer({ athletes, historyFor, metrics, benchmarksByMetric, branding, initialCompareTo, initialRatingScope, onClose }: {
  athletes: GroupTestAthlete[];
  historyFor: (athleteId: string) => TestSession[];
  metrics: TestMetric[];
  benchmarksByMetric: Record<string, TestBenchmark[]>;
  branding: ResolvedBranding;
  initialCompareTo: CompareBasis;
  initialRatingScope: RatingScope;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const athlete = athletes[idx];
  if (!athlete) return null;

  return (
    <TestReportModal
      key={athlete.id}
      athlete={{ name: athlete.name, group: athlete.group, sex: athlete.sex, date_of_birth: athlete.date_of_birth }}
      sessions={historyFor(athlete.id)}
      metrics={metrics}
      benchmarksByMetric={benchmarksByMetric}
      branding={branding}
      initialCompareTo={initialCompareTo}
      initialRatingScope={initialRatingScope}
      onClose={onClose}
      nav={{
        index: idx,
        total: athletes.length,
        onPrev: () => setIdx((i) => Math.max(0, i - 1)),
        onNext: () => setIdx((i) => Math.min(athletes.length - 1, i + 1)),
      }}
    />
  );
}

// ── 3 · Squad summary ────────────────────────────────────────────────────────
function SquadSummaryModal({ groupSession, athletes, historyFor, metrics, benchmarksByMetric, branding, compareTo, ratingScope, onClose }: {
  groupSession: GroupTestSession;
  athletes: GroupTestAthlete[];
  historyFor: (athleteId: string) => TestSession[];
  metrics: TestMetric[];
  benchmarksByMetric: Record<string, TestBenchmark[]>;
  branding: ResolvedBranding;
  compareTo: "previous" | "best" | "first";
  ratingScope: RatingScope;
  onClose: () => void;
}) {
  const scopeRag = (r: TestReportRatedRow | undefined) =>
    ratingScope === "population" ? r?.popRag ?? null : r?.eliteRag ?? null;
  const accent = branding.primaryColor || "#1f6fd6";

  // One report view per athlete, pinned to this group session as "latest".
  const views = useMemo(
    () => new Map(athletes.map((a) => [
      a.id,
      buildTestReportView(a, historyFor(a.id), metrics, benchmarksByMetric, { kind: compareTo }),
    ])),
    [athletes, historyFor, metrics, benchmarksByMetric, compareTo]
  );

  const ratedRow = (athleteId: string, metricId: string): TestReportRatedRow | undefined =>
    views.get(athleteId)?.ratedRows.find((r) => r.metric.id === metricId);

  // Columns = metrics anyone has a rated result for, grouped.
  const { ratedMetrics, screenMetrics } = useMemo(() => {
    const rated = new Map<string, TestMetric>();
    const screen = new Map<string, TestMetric>();
    for (const v of views.values()) {
      for (const r of v.ratedRows) rated.set(r.metric.id, r.metric);
      for (const r of v.asymmetryRows) screen.set(r.metric.id, r.metric);
    }
    return {
      ratedMetrics: sortByMetricGroup([...rated.values()], (m) => m.name),
      screenMetrics: sortByMetricGroup([...screen.values()], (m) => m.name),
    };
  }, [views]);

  const anyComparison = [...views.values()].some((v) => v.compare);
  const mean = (nums: (number | null | undefined)[]) => {
    const vals = nums.filter((v): v is number => v != null);
    return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
  };
  const columnMean = (metricId: string) => mean(athletes.map((a) => ratedRow(a.id, metricId)?.latest));
  const columnPrevMean = (metricId: string) => mean(athletes.map((a) => ratedRow(a.id, metricId)?.prev));

  const print = () => {
    const el = document.getElementById("squad-summary-content");
    if (!el) return;
    const w = window.open("", "_blank", "width=1100,height=1200");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${groupSession.name} — Squad Testing Summary</title>
<style>*{box-sizing:border-box}body{margin:0}@page{size:landscape;margin:12mm}table{border-collapse:collapse}</style>
</head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
  };

  return (
    <div style={st.overlay} onClick={onClose}>
      <div style={st.wideModal} onClick={(e) => e.stopPropagation()}>
        <div style={st.modalHead} className="no-print">
          <div style={st.modalTitle}>Squad Testing Summary</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={st.ghostBtn} onClick={print}>🖨 Print / Save PDF</button>
            <button style={st.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        <div id="squad-summary-content" style={st.summaryDoc}>
          <div style={{ ...st.summaryBrand, color: accent }}>{branding.displayName}</div>
          <div style={st.summaryTitle}>
            {groupSession.name} · {fmtDate(groupSession.date)} · {athletes.length} athletes
          </div>

          {anyComparison && (
            <div style={st.summaryCompareNote}>
              <b>{COMPARE_SHORT[compareTo]}</b> = {COMPARE_LABEL[compareTo].toLowerCase()}, <b>Now</b> = this session, <b>Δ</b> = change (green = improvement).
            </div>
          )}

          {ratedMetrics.length === 0 ? (
            <div style={st.summaryEmpty}>No rated results entered for this session yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={st.sTable}>
                <thead>
                  {anyComparison ? (
                    <>
                      <tr>
                        <th rowSpan={2} style={{ ...st.sTh, ...st.sThLeft }}>Athlete</th>
                        {ratedMetrics.map((m) => (
                          <th key={m.id} colSpan={3} style={{ ...st.sTh, ...st.sThGroup }}>
                            {m.name}<div style={st.sThUnit}>{m.unit}</div>
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {ratedMetrics.map((m) => (
                          <Fragment key={m.id}>
                            <th style={{ ...st.sTh, ...st.sThSub, ...st.sThGroup }}>{COMPARE_SHORT[compareTo]}</th>
                            <th style={{ ...st.sTh, ...st.sThSub }}>Now</th>
                            <th style={{ ...st.sTh, ...st.sThSub }}>Δ</th>
                          </Fragment>
                        ))}
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <th style={{ ...st.sTh, ...st.sThLeft }}>Athlete</th>
                      {ratedMetrics.map((m) => (
                        <th key={m.id} style={st.sTh}>{m.name}<div style={st.sThUnit}>{m.unit}</div></th>
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {athletes.map((a) => {
                    const age = views.get(a.id)?.athleteAge ?? null;
                    return (
                      <tr key={a.id}>
                        <td style={{ ...st.sTd, ...st.sTdLeft }}>
                          {a.name}{age != null ? <span style={st.sAge}> · {age}y</span> : ""}
                        </td>
                        {ratedMetrics.map((m) => {
                          const row = ratedRow(a.id, m.id);
                          const rag = scopeRag(row);
                          const color = rag ? RAG_COLOR[rag] : null;
                          const nowCell = (
                            <td key={`${m.id}-now`} style={{ ...st.sTd, background: color ? color + "22" : "transparent", fontWeight: color ? 700 : 400 }}>
                              {row ? row.latest : "—"}
                            </td>
                          );
                          if (!anyComparison) return nowCell;
                          const delta = row && row.prev != null ? row.latest - row.prev : null;
                          const improved = delta != null ? (m.better_direction === "lower" ? delta < 0 : delta > 0) : null;
                          return (
                            <Fragment key={m.id}>
                              <td style={{ ...st.sTd, ...st.sTdGroup, color: "#6b7684" }}>{row?.prev ?? "—"}</td>
                              {nowCell}
                              <td style={{ ...st.sTd, fontWeight: 700, color: delta == null || delta === 0 ? "#9aa4b0" : improved ? "#2E9E5B" : "#E53935" }}>
                                {delta == null ? "—" : delta === 0 ? "0" : `${improved ? "▲" : "▼"}${Math.abs(delta).toFixed(2)}`}
                              </td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    );
                  })}
                  <tr>
                    <td style={{ ...st.sTd, ...st.sTdLeft, fontWeight: 700 }}>Squad avg</td>
                    {ratedMetrics.map((m) => {
                      const now = columnMean(m.id);
                      if (!anyComparison) {
                        return <td key={m.id} style={{ ...st.sTd, fontWeight: 700 }}>{now === null ? "—" : now.toFixed(1)}</td>;
                      }
                      const prev = columnPrevMean(m.id);
                      return (
                        <Fragment key={m.id}>
                          <td style={{ ...st.sTd, ...st.sTdGroup, fontWeight: 700, color: "#6b7684" }}>{prev === null ? "—" : prev.toFixed(1)}</td>
                          <td style={{ ...st.sTd, fontWeight: 700 }}>{now === null ? "—" : now.toFixed(1)}</td>
                          <td style={st.sTd}>—</td>
                        </Fragment>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {screenMetrics.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={st.summarySubhead}>Asymmetry screening</div>
              {screenMetrics.map((m) => (
                <div key={m.id} style={{ marginBottom: 10 }}>
                  <div style={st.asymMetricName}>{m.name} ({m.unit})</div>
                  <table style={st.sTable}>
                    <thead>
                      <tr>
                        <th style={{ ...st.sTh, ...st.sThLeft }}>Athlete</th>
                        <th style={st.sTh}>Left</th><th style={st.sTh}>Right</th>
                        <th style={st.sTh}>Asym %</th>
                        {anyComparison && <th style={{ ...st.sTh, ...st.sThGroup }}>{COMPARE_SHORT[compareTo]} asym %</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {athletes.map((a) => {
                        const row = views.get(a.id)?.asymmetryRows.find((r) => r.metric.id === m.id);
                        if (!row) return (
                          <tr key={a.id}>
                            <td style={{ ...st.sTd, ...st.sTdLeft }}>{a.name}</td>
                            <td style={st.sTd}>—</td><td style={st.sTd}>—</td><td style={st.sTd}>—</td>
                            {anyComparison && <td style={{ ...st.sTd, ...st.sTdGroup }}>—</td>}
                          </tr>
                        );
                        const col = ASYM_COLOR[row.status];
                        return (
                          <tr key={a.id}>
                            <td style={{ ...st.sTd, ...st.sTdLeft }}>{a.name}</td>
                            <td style={st.sTd}>{row.left}</td>
                            <td style={st.sTd}>{row.right}</td>
                            <td style={{ ...st.sTd, color: col, fontWeight: 700 }}>{row.pct.toFixed(1)}%</td>
                            {anyComparison && (
                              <td style={{ ...st.sTd, ...st.sTdGroup, color: row.prevAsym ? ASYM_COLOR[row.prevAsym.status] : "#9aa4b0" }}>
                                {row.prevAsym ? `${row.prevAsym.pct.toFixed(1)}%` : "—"}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          <div style={st.summaryFoot}>
            &ldquo;Now&rdquo; cell colour = {ratingScope === "population" ? "general-population" : "elite-youth"} rating (green excellent → red needs work) where age/sex norms exist. Best trial shown.
            {anyComparison ? ` Change is vs ${COMPARE_LABEL[compareTo].toLowerCase()}.` : ""} Snapshot on a single day — interpret with training load and wellbeing.
          </div>
        </div>
      </div>
    </div>
  );
}

const ASYM_COLOR: Record<string, string> = { normal: "#2E9E5B", monitor: "#FB8C00", concern: "#E53935" };

// ── 2 · Combined batch print ─────────────────────────────────────────────────
function BatchPrint({ athletes, historyFor, metrics, benchmarksByMetric, branding, compareTo, ratingScope, onClose }: {
  athletes: GroupTestAthlete[];
  historyFor: (athleteId: string) => TestSession[];
  metrics: TestMetric[];
  benchmarksByMetric: Record<string, TestBenchmark[]>;
  branding: ResolvedBranding;
  compareTo: CompareBasis;
  ratingScope: RatingScope;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 300);
    const done = () => onClose();
    window.addEventListener("afterprint", done);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", done); };
  }, [onClose]);

  return (
    <div style={st.batchOverlay}>
      <style>{`@media screen { .batch-print-close { position: fixed; top: 12px; right: 12px; z-index: 10; } }
      @media print { .batch-print-close { display: none !important; } }`}</style>
      <button className="batch-print-close" style={st.btn} onClick={onClose}>Close</button>
      {athletes.map((a, i) => {
          const view = buildTestReportView(a, historyFor(a.id), metrics, benchmarksByMetric, compareTo);
          return (
            <TestReportBody
              key={a.id}
              athleteName={a.name}
              athleteGroup={a.group}
              athleteSex={a.sex}
              view={view}
              mode="full"
              ratingScope={ratingScope}
              branding={branding}
              pageBreak={i < athletes.length - 1}
            />
          );
        })}
    </div>
  );
}

// ── styles ───────────────────────────────────────────────────────────────────
const st: Record<string, React.CSSProperties> = {
  btn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  compactBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  menu: { position: "absolute", right: 0, top: "calc(100% + 6px)", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: 6, minWidth: 240, zIndex: 50, boxShadow: "0 8px 30px rgba(0,0,0,.4)" },
  menuItem: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "transparent", border: "none", color: "var(--text)", fontSize: 13, padding: "8px 10px", borderRadius: 7, cursor: "pointer" },
  menuItemLocked: { color: "var(--mute)" },
  lockTag: { fontSize: 10, fontWeight: 700, color: "var(--mute)", whiteSpace: "nowrap" },
  compareRow: { display: "flex", alignItems: "center", gap: 8, padding: "6px 10px 8px", borderBottom: "1px solid var(--line)", marginBottom: 4 },
  compareRowLabel: { fontSize: 11, color: "var(--mute)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" },
  compareRowSelect: { flex: 1, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6, padding: "5px 6px", fontSize: 12 },
  upgrade: { fontSize: 12, color: "var(--mute)", padding: "8px 10px", borderTop: "1px solid var(--line)", marginTop: 4 },
  upgradeLink: { background: "transparent", border: "none", color: "var(--accent)", fontWeight: 700, cursor: "pointer", fontSize: 12, padding: 0 },
  err: { fontSize: 12, color: "#FF6B6B", padding: "6px 10px" },

  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.75)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 200, overflowY: "auto", padding: "0 0 40px" },
  loadingCard: { background: "var(--panel)", color: "var(--text)", padding: 24, borderRadius: 12, marginTop: 80 },
  wideModal: { background: "var(--panel)", width: "100%", maxWidth: 1040, borderRadius: 14, margin: "24px 0", boxShadow: "0 8px 40px rgba(0,0,0,.6)" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", borderBottom: "1px solid var(--line)" },
  modalTitle: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer" },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 18, cursor: "pointer" },

  summaryDoc: { background: "#fff", color: "#16202a", padding: 22, borderRadius: "0 0 14px 14px", fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif' },
  summaryBrand: { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: 2 },
  summaryTitle: { fontSize: 13, fontWeight: 600, marginTop: 2, marginBottom: 14 },
  summaryEmpty: { color: "#6b7684", fontSize: 13, padding: "20px 0" },
  summaryCompareNote: { fontSize: 11, color: "#6b7684", marginBottom: 8 },
  summarySubhead: { fontSize: 13, fontWeight: 700, marginBottom: 8 },
  asymMetricName: { fontSize: 12, fontWeight: 700, marginBottom: 4 },
  sTable: { width: "100%", borderCollapse: "collapse", fontSize: 11 },
  sTh: { padding: "6px 8px", textAlign: "center", fontSize: 10, fontWeight: 700, color: "#6b7684", textTransform: "uppercase", borderBottom: "2px solid #d8dde3", whiteSpace: "nowrap" },
  sThLeft: { textAlign: "left" },
  sThGroup: { borderLeft: "1px solid #d8dde3" },
  sThSub: { fontSize: 9, padding: "3px 8px", borderBottom: "1px solid #d8dde3" },
  sThUnit: { fontWeight: 400, color: "#9aa4b0", textTransform: "none" },
  sTd: { padding: "6px 8px", textAlign: "center", borderBottom: "1px solid #eef0f3" },
  sTdGroup: { borderLeft: "1px solid #eef0f3" },
  sTdLeft: { textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" },
  sAge: { color: "#9aa4b0", fontWeight: 400 },
  summaryFoot: { fontSize: 10, color: "#6b7684", lineHeight: 1.5, borderTop: "1px solid #d8dde3", paddingTop: 10, marginTop: 14 },

  batchOverlay: { position: "fixed", inset: 0, background: "#fff", zIndex: 300, overflowY: "auto" },
};

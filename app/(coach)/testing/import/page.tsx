"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  readTableFile, detectIdentityColumns, tableToImport, readPdfLines, pdfLinesToImport, mergeImports,
  suggestMetric, defaultMapping, matchAthlete, buildSessions, unitScale, NEW_METRIC,
  type Table, type IdentityColumns, type ImportField, type FieldMapping, type ParsedImport, type ImportRecord,
} from "@/lib/import/test-results";
import { getImportMappings, saveImportMappings, commitTestImport, type ImportCommitResult } from "@/lib/data/test-import";
import { listTestMetrics, listTestBatteries, createTestMetric } from "@/lib/data/testing";
import { listAthletes } from "@/lib/data/athletes";
import type { Athlete, TestBattery, TestMetric } from "@/types";

// Testing → Import results. CSV / Excel exports and force plate PDFs,
// read entirely in the browser (no AI, no upload of the file itself).
// See lib/import/test-results.ts for the parsing and matching rules.

type Source =
  | { kind: "table"; fileName: string; table: Table; idCols: IdentityColumns }
  | { kind: "pdf"; files: { name: string; lines: string[] }[] };

const ID_ROLES: { role: keyof IdentityColumns; label: string }[] = [
  { role: "athlete", label: "Athlete name" },
  { role: "firstName", label: "First name" },
  { role: "lastName", label: "Last name" },
  { role: "date", label: "Test date" },
  { role: "testType", label: "Test type" },
  { role: "bodyweight", label: "Bodyweight (kg)" },
];

const newMetricName = (f: ImportField) => (f.testType ? `${f.testType} - ${f.baseLabel}` : f.baseLabel).slice(0, 80);
const guessDirection = (label: string): "higher" | "lower" =>
  /\b(time|contact|duration|split|asym|asymmetry|imbalance)\b/i.test(label) ? "lower" : "higher";

export default function TestImportPage() {
  const searchParams = useSearchParams();
  const presetAthleteId = searchParams.get("athlete");
  const fileRef = useRef<HTMLInputElement>(null);

  const [metrics, setMetrics] = useState<TestMetric[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [batteries, setBatteries] = useState<TestBattery[]>([]);
  const [saved, setSaved] = useState<Record<string, FieldMapping>>({});
  const [loading, setLoading] = useState(true);

  const [source, setSource] = useState<Source | null>(null);
  const [mapping, setMapping] = useState<Record<string, FieldMapping>>({});
  const [newNames, setNewNames] = useState<Record<string, string>>({});
  const [athleteFor, setAthleteFor] = useState<Record<string, string>>({}); // athleteLabel or record id -> athlete id
  const [dateFor, setDateFor] = useState<Record<string, string>>({});       // record id -> date (PDFs)
  const [fallbackDate, setFallbackDate] = useState("");
  const [batteryId, setBatteryId] = useState("");
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [search, setSearch] = useState("");

  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<(ImportCommitResult & { athletes: { id: string; name: string }[] }) | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, a, b, sm] = await Promise.all([listTestMetrics(), listAthletes(), listTestBatteries(), getImportMappings()]);
      setMetrics(m);
      setAthletes(a);
      setBatteries(b);
      setSaved(sm);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load testing data");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const parsed: ParsedImport | null = useMemo(() => {
    if (!source) return null;
    if (source.kind === "table") return tableToImport(source.table, source.idCols, source.fileName);
    return mergeImports(source.files.map((f) => pdfLinesToImport(f.lines, f.name, athletes.map((a) => a.name))));
  }, [source, athletes]);

  // Fresh matches whenever the parsed fields change: remembered first,
  // then a best guess by name. Coach edits are kept for fields that stay.
  useEffect(() => {
    if (!parsed) return;
    setMapping((prev) => {
      const next: Record<string, FieldMapping> = {};
      for (const f of parsed.fields) {
        if (prev[f.key]) next[f.key] = prev[f.key];
        else if (saved[f.key] && (saved[f.key].metricId === null || metrics.some((m) => m.id === saved[f.key].metricId))) next[f.key] = saved[f.key];
        else next[f.key] = defaultMapping(f, suggestMetric(f, metrics));
      }
      return next;
    });
  }, [parsed, saved, metrics]);

  // Athlete matching, by name label (spreadsheets) or per file (PDFs).
  useEffect(() => {
    if (!parsed) return;
    setAthleteFor((prev) => {
      const next = { ...prev };
      for (const r of parsed.records) {
        const k = athleteKey(r);
        if (next[k] !== undefined) continue;
        const hit = matchAthlete(r.athleteLabel, athletes);
        next[k] = hit?.id ?? (source?.kind === "pdf" && presetAthleteId ? presetAthleteId : "");
      }
      return next;
    });
  }, [parsed, athletes, source, presetAthleteId]);

  function athleteKey(r: ImportRecord) {
    return source?.kind === "pdf" ? r.id : `name:${r.athleteLabel.toLowerCase()}`;
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    setReading(true);
    try {
      const list = [...files];
      const pdfs = list.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
      if (pdfs.length) {
        if (pdfs.length !== list.length) throw new Error("Upload either PDFs or one spreadsheet at a time, not both.");
        const read = [];
        for (const f of pdfs) {
          const lines = await readPdfLines(f);
          if (!lines.some((l) => /\d/.test(l))) throw new Error(`"${f.name}" has no readable text - it may be a scanned image. Export a CSV from the force plate software instead.`);
          read.push({ name: f.name, lines });
        }
        setSource({ kind: "pdf", files: read });
      } else {
        if (list.length > 1) throw new Error("Upload one spreadsheet at a time.");
        const table = await readTableFile(list[0]);
        if (!table.rows.length) throw new Error("That file has no rows.");
        setSource({ kind: "table", fileName: list[0].name, table, idCols: detectIdentityColumns(table.headers) });
      }
      setMapping({});
      setAthleteFor({});
      setDateFor({});
      setDone(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const metricById = useMemo(() => new Map(metrics.map((m) => [m.id, m])), [metrics]);
  const fieldByKey = useMemo(() => new Map((parsed?.fields ?? []).map((f) => [f.key, f])), [parsed]);
  const nameForNew = (f: ImportField) => (newNames[f.key] ?? newMetricName(f)).trim();

  // New metrics are grouped by name, so a Left + Right column pair becomes
  // one two-sided metric.
  const newMetricPlan = useMemo(() => {
    const plan = new Map<string, { name: string; unit: string; bilateral: boolean; direction: "higher" | "lower" }>();
    for (const [key, m] of Object.entries(mapping)) {
      if (m.metricId !== NEW_METRIC) continue;
      const f = fieldByKey.get(key);
      if (!f) continue;
      const name = nameForNew(f);
      if (!name) continue;
      const ex = plan.get(name.toLowerCase());
      plan.set(name.toLowerCase(), {
        name,
        unit: ex?.unit || f.unit || "",
        bilateral: (ex?.bilateral ?? false) || m.side !== null,
        direction: ex?.direction ?? guessDirection(f.label),
      });
    }
    return plan;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapping, fieldByKey, newNames]);

  const resolveMetric = useCallback((key: string, m: FieldMapping, created?: Map<string, string>): string | null => {
    if (!m.metricId) return null;
    if (m.metricId === NEW_METRIC) {
      const f = fieldByKey.get(key);
      if (!f) return null;
      const name = nameForNew(f).toLowerCase();
      const plan = newMetricPlan.get(name);
      if (plan?.bilateral && !m.side) return null;
      return created ? created.get(name) ?? null : `new:${name}`;
    }
    const metric = metricById.get(m.metricId);
    if (!metric) return null;
    if (metric.is_bilateral && !m.side) return null;
    return metric.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldByKey, metricById, newMetricPlan, newNames]);

  const recordAthlete = useCallback((r: ImportRecord) => athleteFor[athleteKey(r)] || null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [athleteFor, source]);
  const recordDate = useCallback((r: ImportRecord) => dateFor[r.id] || r.date || fallbackDate || null, [dateFor, fallbackDate]);

  const preview = useMemo(() => {
    if (!parsed) return null;
    return buildSessions(parsed, mapping, recordAthlete, recordDate, (k, m) => resolveMetric(k, m));
  }, [parsed, mapping, recordAthlete, recordDate, resolveMetric]);

  const updateMapping = (key: string, patch: Partial<FieldMapping>) =>
    setMapping((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const chooseMetric = (f: ImportField, metricId: string) => {
    if (!metricId) return updateMapping(f.key, { metricId: null, side: null, scale: 1 });
    if (metricId === NEW_METRIC) return updateMapping(f.key, { metricId: NEW_METRIC, side: f.sideHint, scale: 1 });
    const metric = metricById.get(metricId);
    updateMapping(f.key, {
      metricId,
      side: metric?.is_bilateral ? f.sideHint : null,
      scale: unitScale(f.unit, metric?.unit ?? null),
    });
  };

  const runImport = async () => {
    if (!parsed || !preview?.sessions.length) return;
    setBusy(true);
    setError("");
    try {
      // 1. Create any new metrics.
      const created = new Map<string, string>();
      for (const [lower, p] of newMetricPlan) {
        const existing = metrics.find((m) => m.name.trim().toLowerCase() === lower);
        if (existing) { created.set(lower, existing.id); continue; }
        const m = await createTestMetric({ name: p.name, unit: p.unit, better_direction: p.direction, is_bilateral: p.bilateral });
        created.set(lower, m.id);
      }
      // 2. Build the real sessions and save them.
      const outcome = buildSessions(parsed, mapping, recordAthlete, recordDate, (k, m) => resolveMetric(k, m, created));
      const result = await commitTestImport(outcome.sessions, batteryId || null);
      // 3. Remember every column's match (ignored ones too) for next time.
      const remember: Record<string, FieldMapping> = {};
      for (const [key, m] of Object.entries(mapping)) {
        const metricId = m.metricId === NEW_METRIC ? resolveMetric(key, { ...m, side: m.side ?? "left" }, created) : m.metricId;
        remember[key] = { metricId: metricId ?? null, side: m.side, scale: m.scale || 1 };
      }
      await saveImportMappings(remember).catch(() => {});
      const ids = [...new Set(outcome.sessions.map((s) => s.athleteId))];
      setDone({ ...result, athletes: ids.map((id) => ({ id, name: athletes.find((a) => a.id === id)?.name ?? "Athlete" })) });
      setSource(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div style={s.page}><div style={s.muted}>Loading…</div></div>;

  const fields = parsed?.fields ?? [];
  const matched = fields.filter((f) => mapping[f.key]?.metricId);
  const unmatched = fields.filter((f) => !mapping[f.key]?.metricId);
  const q = search.trim().toLowerCase();
  const unmatchedShown = unmatched.filter((f) => !q || f.label.toLowerCase().includes(q) || (f.testType ?? "").toLowerCase().includes(q));
  const athleteLabels = parsed && source?.kind === "table"
    ? [...new Map(parsed.records.map((r) => [athleteKey(r), r.athleteLabel])).entries()]
    : [];
  const missingDates = parsed ? parsed.records.filter((r) => !r.date).length : 0;

  return (
    <div style={s.page}>
      <div style={s.crumbs}><Link href="/testing" style={s.crumbLink}>Testing</Link> / Import results</div>
      <h1 style={s.title}>Import testing results</h1>
      <p style={s.subtitle}>
        Upload a CSV or Excel export (VALD ForceDecks, Hawkin Dynamics, timing gates, your own spreadsheet) or force plate PDF reports.
        Files are read on this device - no AI, and nothing is uploaded until you press Import. Your column matches are remembered for next time.
      </p>

      {error && <div style={s.errorBox}>{error}</div>}

      {done && (
        <section style={s.card}>
          <div style={s.cardTitle}>Imported ✓</div>
          <div style={s.text}>
            {done.created} new test session{done.created === 1 ? "" : "s"}{done.updated ? `, ${done.updated} existing session${done.updated === 1 ? "" : "s"} updated` : ""} · {done.results} result{done.results === 1 ? "" : "s"}.
          </div>
          <div style={s.chips}>
            {done.athletes.map((a) => (
              <Link key={a.id} href={`/athletes/${a.id}/testing`} style={s.chipLink}>{a.name} →</Link>
            ))}
          </div>
        </section>
      )}

      {/* 1 · Upload */}
      <section style={s.card}>
        <div style={s.cardTitle}>1 · Choose files</div>
        <div
          style={s.drop}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        >
          {reading ? "Reading…" : source ? `${source.kind === "table" ? source.fileName : `${source.files.length} PDF${source.files.length === 1 ? "" : "s"}`} - choose different files` : "Drop a CSV / Excel file, or one or more PDF reports - or click to choose"}
        </div>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.pdf,text/csv,application/pdf" multiple style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
        <div style={s.muted}>Best results: export a CSV from the force plate software. PDFs work when they contain real text (not a scanned image).</div>
      </section>

      {parsed && source && (
        <>
          {/* 2 · Who and when */}
          <section style={s.card}>
            <div style={s.cardTitle}>2 · Athletes and dates</div>
            {source.kind === "table" && (
              <>
                <div style={s.muted}>Which columns hold who and when? (Detected automatically - change if wrong.)</div>
                <div style={s.grid3}>
                  {ID_ROLES.map(({ role, label }) => (
                    <label key={role} style={s.field}>
                      <span style={s.fieldLabel}>{label}</span>
                      <select
                        style={s.input}
                        value={source.idCols[role] ?? ""}
                        onChange={(e) => setSource({ ...source, idCols: { ...source.idCols, [role]: e.target.value || null } })}
                      >
                        <option value="">-</option>
                        {source.table.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                {missingDates > 0 && (
                  <label style={{ ...s.field, maxWidth: 260 }}>
                    <span style={s.fieldLabel}>Date for rows without one ({missingDates})</span>
                    <input type="date" style={s.input} value={fallbackDate} onChange={(e) => setFallbackDate(e.target.value)} />
                  </label>
                )}
                <div style={s.subHead}>Athletes in the file</div>
                <div style={s.list}>
                  {athleteLabels.map(([key, label]) => (
                    <div key={key} style={s.row}>
                      <div style={{ ...s.rowLabel, color: athleteFor[key] ? "var(--text)" : "#F59E0B" }}>{label || "(no name)"}</div>
                      <select style={{ ...s.input, maxWidth: 260 }} value={athleteFor[key] ?? ""} onChange={(e) => setAthleteFor({ ...athleteFor, [key]: e.target.value })}>
                        <option value="">Skip - not matched</option>
                        {athletes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </>
            )}
            {source.kind === "pdf" && (
              <div style={s.list}>
                {parsed.records.map((r) => (
                  <div key={r.id} style={s.row}>
                    <div style={s.rowLabel}>{r.source}</div>
                    <select style={{ ...s.input, maxWidth: 220 }} value={athleteFor[r.id] ?? ""} onChange={(e) => setAthleteFor({ ...athleteFor, [r.id]: e.target.value })}>
                      <option value="">Choose athlete…</option>
                      {athletes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <input type="date" style={{ ...s.input, maxWidth: 160 }} value={dateFor[r.id] ?? r.date ?? ""} onChange={(e) => setDateFor({ ...dateFor, [r.id]: e.target.value })} />
                  </div>
                ))}
              </div>
            )}
            <label style={{ ...s.field, maxWidth: 320 }}>
              <span style={s.fieldLabel}>Test battery (optional)</span>
              <select style={s.input} value={batteryId} onChange={(e) => setBatteryId(e.target.value)}>
                <option value="">None</option>
                {batteries.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          </section>

          {/* 3 · Columns → metrics */}
          <section style={s.card}>
            <div style={s.cardTitle}>3 · Match results to your metrics</div>
            <div style={s.muted}>
              {matched.length} of {fields.length} {source.kind === "pdf" ? "values" : "columns"} will be imported. Units are converted automatically (e.g. m → cm).
            </div>
            {matched.length > 0 && (
              <div style={s.list}>
                {matched.map((f) => (
                  <FieldRow key={f.key} f={f} m={mapping[f.key]} metrics={metrics} metricById={metricById} newName={nameForNew(f)}
                    onMetric={(id) => chooseMetric(f, id)} onPatch={(p) => updateMapping(f.key, p)}
                    onNewName={(n) => setNewNames({ ...newNames, [f.key]: n })} />
                ))}
              </div>
            )}
            <button style={s.linkBtn} onClick={() => setShowUnmatched(!showUnmatched)}>
              {showUnmatched ? "Hide" : "Show"} {unmatched.length} {source.kind === "pdf" ? "value" : "column"}{unmatched.length === 1 ? "" : "s"} not being imported
            </button>
            {showUnmatched && (
              <>
                <input style={{ ...s.input, maxWidth: 320 }} placeholder="Search columns…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <div style={s.list}>
                  {unmatchedShown.slice(0, 200).map((f) => (
                    <FieldRow key={f.key} f={f} m={mapping[f.key]} metrics={metrics} metricById={metricById} newName={nameForNew(f)}
                      onMetric={(id) => chooseMetric(f, id)} onPatch={(p) => updateMapping(f.key, p)}
                      onNewName={(n) => setNewNames({ ...newNames, [f.key]: n })} />
                  ))}
                  {unmatchedShown.length > 200 && <div style={s.muted}>Showing the first 200 - search to narrow it down.</div>}
                </div>
              </>
            )}
          </section>

          {/* 4 · Preview + import */}
          <section style={s.card}>
            <div style={s.cardTitle}>4 · Check and import</div>
            {preview && preview.sessions.length > 0 ? (
              <div style={s.list}>
                {preview.sessions.slice(0, 50).map((ps) => (
                  <div key={`${ps.athleteId}|${ps.date}`} style={s.row}>
                    <div style={s.rowLabel}>{athletes.find((a) => a.id === ps.athleteId)?.name}</div>
                    <div style={s.muted}>{ps.date}{ps.bodyweightKg ? ` · ${ps.bodyweightKg}kg` : ""}</div>
                    <div style={{ ...s.muted, marginLeft: "auto" }}>{ps.results.length} metric{ps.results.length === 1 ? "" : "s"} · {ps.results.reduce((n, r) => n + r.values.length, 0)} trials</div>
                  </div>
                ))}
                {preview.sessions.length > 50 && <div style={s.muted}>…and {preview.sessions.length - 50} more sessions</div>}
              </div>
            ) : (
              <div style={s.muted}>Nothing to import yet - match at least one athlete and one result.</div>
            )}
            {preview && preview.skipped.length > 0 && (
              <details>
                <summary style={s.summary}>{preview.skipped.length} row{preview.skipped.length === 1 ? "" : "s"} skipped</summary>
                <div style={{ ...s.muted, marginTop: 6 }}>
                  {preview.skipped.slice(0, 30).map((sk, i) => <div key={i}>{sk.source}: {sk.reason}</div>)}
                </div>
              </details>
            )}
            {newMetricPlan.size > 0 && (
              <div style={s.muted}>Will create {newMetricPlan.size} new metric{newMetricPlan.size === 1 ? "" : "s"}: {[...newMetricPlan.values()].map((p) => p.name).join(", ")}. Add benchmarks for them under Metrics & Benchmarks.</div>
            )}
            <div style={s.muted}>If an athlete already has a test session on that date, these results are added to it (re-importing replaces the same results rather than duplicating them).</div>
            <button style={{ ...s.primary, opacity: busy || !preview?.sessions.length ? 0.6 : 1 }} disabled={busy || !preview?.sessions.length} onClick={runImport}>
              {busy ? "Importing…" : `Import ${preview?.sessions.length ?? 0} session${preview?.sessions.length === 1 ? "" : "s"}`}
            </button>
          </section>
        </>
      )}
    </div>
  );
}

function FieldRow({ f, m, metrics, metricById, newName, onMetric, onPatch, onNewName }: {
  f: ImportField;
  m: FieldMapping | undefined;
  metrics: TestMetric[];
  metricById: Map<string, TestMetric>;
  newName: string;
  onMetric: (id: string) => void;
  onPatch: (p: Partial<FieldMapping>) => void;
  onNewName: (n: string) => void;
}) {
  const metric = m?.metricId && m.metricId !== NEW_METRIC ? metricById.get(m.metricId) : null;
  const needsSide = (metric?.is_bilateral || (m?.metricId === NEW_METRIC && f.sideHint)) ?? false;
  return (
    <div style={s.fieldRow}>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={s.rowLabel}>
          {f.testType && <span style={s.typeTag}>{f.testType}</span>}
          {f.label}
        </div>
        <div style={s.muted}>e.g. {f.samples.join(", ")}{f.count > f.samples.length ? ` · ${f.count} values` : ""}</div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", flex: "1 1 280px" }}>
        <select style={{ ...s.input, flex: "1 1 180px" }} value={m?.metricId ?? ""} onChange={(e) => onMetric(e.target.value)}>
          <option value="">- Don&apos;t import -</option>
          <option value={NEW_METRIC}>+ New metric</option>
          {metrics.map((x) => <option key={x.id} value={x.id}>{x.name}{x.unit ? ` (${x.unit})` : ""}</option>)}
        </select>
        {needsSide && (
          <select style={{ ...s.input, width: 90, borderColor: m?.side ? "var(--line)" : "#F59E0B" }} value={m?.side ?? ""} onChange={(e) => onPatch({ side: (e.target.value || null) as FieldMapping["side"] })}>
            <option value="">Side?</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        )}
        {m?.metricId && (
          <label style={s.scale} title="Each value is multiplied by this - e.g. 100 turns metres into centimetres">
            ×
            <input style={{ ...s.input, width: 70 }} inputMode="decimal" value={String(m.scale)} onChange={(e) => onPatch({ scale: parseFloat(e.target.value) || 1 })} />
          </label>
        )}
      </div>
      {m?.metricId === NEW_METRIC && (
        <input style={{ ...s.input, flexBasis: "100%" }} value={newName} onChange={(e) => onNewName(e.target.value)} placeholder="New metric name" />
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 980 },
  crumbs: { fontSize: 12, color: "var(--mute)", marginBottom: 6 },
  crumbLink: { color: "var(--accent)", textDecoration: "none" },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, margin: 0 },
  subtitle: { fontSize: 13, color: "var(--mute)", marginTop: 4, maxWidth: 680, lineHeight: 1.5 },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 14px", fontSize: 13, margin: "12px 0" },
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginTop: 14, display: "flex", flexDirection: "column", gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: 800 },
  subHead: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 4 },
  text: { fontSize: 13, color: "var(--text)" },
  muted: { fontSize: 12, color: "var(--mute)", lineHeight: 1.45 },
  drop: { border: "1px dashed var(--line)", borderRadius: 10, padding: "22px 16px", textAlign: "center", fontSize: 13, color: "var(--mute)", cursor: "pointer", background: "var(--ink)" },
  grid3: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  fieldLabel: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.05em" },
  input: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6, padding: "7px 8px", fontSize: 13, minWidth: 0 },
  list: { display: "flex", flexDirection: "column", gap: 6 },
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px" },
  rowLabel: { fontSize: 13, fontWeight: 600, flex: "1 1 160px", minWidth: 0, overflowWrap: "anywhere" },
  fieldRow: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px" },
  typeTag: { fontSize: 10, fontWeight: 700, color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 4, padding: "1px 5px", marginRight: 6 },
  scale: { display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--mute)" },
  linkBtn: { background: "none", border: "none", color: "var(--accent)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, alignSelf: "flex-start" },
  summary: { fontSize: 12, color: "#F59E0B", cursor: "pointer", fontWeight: 600 },
  chips: { display: "flex", gap: 6, flexWrap: "wrap" },
  chipLink: { fontSize: 12, fontWeight: 600, color: "var(--accent)", border: "1px solid var(--line)", borderRadius: 999, padding: "4px 10px", textDecoration: "none" },
  primary: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", alignSelf: "flex-start" },
};

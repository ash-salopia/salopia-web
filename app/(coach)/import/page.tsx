"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ROSTER_FIELDS, parseRosterCsv, autoDetectMapping, buildRosterRows,
  type ColumnMapping, type RosterField, type BuiltRoster,
} from "@/lib/import/roster";
import {
  commitRosterImport, listImportBatches, getRemainingSeats,
  getRosterRevertImpact, revertRosterImport,
  type ImportBatch, type RevertImpact,
} from "@/lib/data/import";
import { listAthletes } from "@/lib/data/athletes";

type Step = "upload" | "map" | "preview" | "done";

const NONE = "__none__";

const TEMPLATE_CSV =
  "data:text/csv;charset=utf-8," +
  encodeURIComponent(
    "Name,Group,Sex,Date of Birth,Bodyweight (kg),Max HR,Resting HR,MAS (km/h)\n" +
    "Jane Doe,U16 Girls,female,2009-04-12,58.5,198,54,16.5\n" +
    "John Smith,First Team,male,12/03/2001,82,192,48,18.2\n"
  );

export default function ImportPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [filename, setFilename] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [existingNames, setExistingNames] = useState<string[]>([]);
  const [remainingSeats, setRemainingSeats] = useState<number | null>(null);
  const [result, setResult] = useState<{ created: number } | null>(null);

  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [revertTarget, setRevertTarget] = useState<{ batch: ImportBatch; impact: RevertImpact } | null>(null);

  const reloadBatches = useCallback(() => {
    listImportBatches().then(setBatches).catch(() => {});
  }, []);

  useEffect(() => {
    reloadBatches();
    getRemainingSeats().then(setRemainingSeats).catch(() => {});
    listAthletes().then((a) => setExistingNames(a.map((x) => x.name))).catch(() => {});
  }, [reloadBatches]);

  const built: BuiltRoster | null = useMemo(() => {
    if (step !== "preview" && step !== "map") return null;
    if (!mapping.name) return null;
    return buildRosterRows(rawRows, mapping, existingNames);
  }, [step, mapping, rawRows, existingNames]);

  const reset = () => {
    setStep("upload"); setError(""); setFilename(""); setSourceLabel("");
    setHeaders([]); setRawRows([]); setMapping({}); setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    setError("");
    try {
      const text = await file.text();
      const { headers: h, rows } = parseRosterCsv(text);
      if (!h.length) { setError("That file has no header row."); return; }
      if (!rows.length) { setError("That file has no data rows."); return; }
      setFilename(file.name);
      setHeaders(h);
      setRawRows(rows);
      setMapping(autoDetectMapping(h));
      setStep("map");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    }
  };

  const commit = async () => {
    if (!built?.valid.length) return;
    setBusy(true); setError("");
    try {
      const r = await commitRosterImport(built.valid, { sourceLabel, filename });
      setResult({ created: r.created });
      setStep("done");
      reloadBatches();
      getRemainingSeats().then(setRemainingSeats).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const openRevert = async (batch: ImportBatch) => {
    setError("");
    try {
      const impact = await getRosterRevertImpact(batch.id);
      setRevertTarget({ batch, impact });
    } catch {
      setError("Couldn't work out what that import contains.");
    }
  };

  const confirmRevert = async () => {
    if (!revertTarget) return;
    setBusy(true); setError("");
    try {
      await revertRosterImport(revertTarget.batch.id);
      setRevertTarget(null);
      reloadBatches();
      getRemainingSeats().then(setRemainingSeats).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revert failed.");
    } finally {
      setBusy(false);
    }
  };

  const errorCount = built?.issues.filter((i) => i.level === "error").length ?? 0;
  const warningCount = built?.issues.filter((i) => i.level === "warning").length ?? 0;

  return (
    <div style={s.page}>
      <div style={s.head}>
        <h1 style={s.title}>Import data</h1>
        <button style={s.ghost} onClick={() => router.push("/athletes")}>← Athletes</button>
      </div>
      <p style={s.sub}>
        Switching from another platform? Bring your athlete roster across in one upload.
        More importers (exercise library, PBs, test results) are coming — for now this
        covers the roster.
      </p>

      {error && <div style={s.errBox}>{error}</div>}

      {/* ── Stepper ── */}
      <div style={s.steps}>
        {(["upload", "map", "preview"] as Step[]).map((st, i) => (
          <div key={st} style={{ ...s.stepPill, ...(step === st ? s.stepPillActive : {}), ...(stepIndex(step) > i ? s.stepPillDone : {}) }}>
            {i + 1}. {st === "upload" ? "Upload CSV" : st === "map" ? "Match columns" : "Review & import"}
          </div>
        ))}
      </div>

      {/* ── Step: upload ── */}
      {step === "upload" && (
        <div style={s.card}>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/comma-separated-values,application/csv,application/vnd.ms-excel"
            style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <div style={s.cardLabel}>Upload a roster CSV</div>
          <div style={s.cardDesc}>
            Export your athlete list from your current app as CSV (or save a spreadsheet as
            CSV). It needs a header row and one athlete per row. Any column names are fine —
            you&apos;ll match them up on the next step.
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" as const }}>
            <button style={s.primary} onClick={() => fileRef.current?.click()}>Choose CSV file</button>
            <a href={TEMPLATE_CSV} download="visbuild-roster-template.csv" style={s.templateLink}>Download a template</a>
          </div>
          {remainingSeats != null && (
            <div style={{ ...s.cardDesc, marginTop: 4 }}>
              Your plan has <strong>{remainingSeats}</strong> athlete seat{remainingSeats === 1 ? "" : "s"} left.
            </div>
          )}
        </div>
      )}

      {/* ── Step: map ── */}
      {step === "map" && (
        <div style={s.card}>
          <div style={s.cardLabel}>Match your columns</div>
          <div style={s.cardDesc}>
            We&apos;ve guessed where we can. Set <strong>Full name</strong> at minimum — the rest are optional.
          </div>
          <div style={s.mapGrid}>
            {ROSTER_FIELDS.map((f) => (
              <div key={f.field} style={s.mapRow}>
                <div>
                  <div style={s.mapField}>{f.label}{f.required && <span style={s.req}> *</span>}</div>
                  <div style={s.mapHint}>{f.hint}</div>
                </div>
                <select
                  style={s.select}
                  value={mapping[f.field] ?? NONE}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMapping((m) => {
                      const next = { ...m };
                      // a header can only feed one field
                      for (const k of Object.keys(next) as RosterField[]) if (next[k] === v) delete next[k];
                      if (v === NONE) delete next[f.field]; else next[f.field] = v;
                      return next;
                    });
                  }}
                >
                  <option value={NONE}>— not in file —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={s.btnRow}>
            <button style={s.ghost} onClick={reset}>Start over</button>
            <button
              style={{ ...s.primary, opacity: mapping.name ? 1 : 0.5 }}
              disabled={!mapping.name}
              onClick={() => setStep("preview")}
            >
              Preview {rawRows.length} row{rawRows.length === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step: preview ── */}
      {step === "preview" && built && (
        <div style={s.card}>
          <div style={s.cardLabel}>Review &amp; import</div>

          <div style={s.statsRow}>
            <div style={s.stat}><div style={s.statVal}>{built.valid.length}</div><div style={s.statLbl}>Athletes</div></div>
            {warningCount > 0 && <div style={s.stat}><div style={{ ...s.statVal, color: "var(--warn)" }}>{warningCount}</div><div style={s.statLbl}>Warnings</div></div>}
            {errorCount > 0 && <div style={s.stat}><div style={{ ...s.statVal, color: "#ff7d7d" }}>{errorCount}</div><div style={s.statLbl}>Skipped</div></div>}
            {built.duplicateNames.length > 0 && <div style={s.stat}><div style={{ ...s.statVal, color: "var(--warn)" }}>{built.duplicateNames.length}</div><div style={s.statLbl}>Possible dupes</div></div>}
          </div>

          {remainingSeats != null && built.valid.length > remainingSeats && (
            <div style={s.errBox}>
              This is {built.valid.length} athletes but you only have {remainingSeats} seat{remainingSeats === 1 ? "" : "s"} left.
              Free up seats or contact support before importing.
            </div>
          )}

          <div style={s.previewTableWrap}>
            <table style={s.table}>
              <thead><tr>
                <th style={s.th}>Name</th><th style={s.th}>Group</th><th style={s.th}>Sex</th>
                <th style={s.th}>DOB</th><th style={s.th}>BW</th>
              </tr></thead>
              <tbody>
                {built.valid.slice(0, 12).map((r, i) => (
                  <tr key={i}>
                    <td style={s.td}>{r.name}</td>
                    <td style={s.td}>{r.group || "—"}</td>
                    <td style={s.td}>{r.sex ?? "—"}</td>
                    <td style={s.td}>{r.date_of_birth ?? "—"}</td>
                    <td style={s.td}>{r.bodyweight_kg != null ? `${r.bodyweight_kg}kg` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {built.valid.length > 12 && <div style={s.cardDesc}>…and {built.valid.length - 12} more</div>}
          </div>

          {built.issues.length > 0 && (
            <details style={s.issues}>
              <summary style={s.issuesSummary}>{built.issues.length} note{built.issues.length === 1 ? "" : "s"} on this file</summary>
              <ul style={s.issuesList}>
                {built.issues.slice(0, 100).map((iss, i) => (
                  <li key={i} style={{ color: iss.level === "error" ? "#ff7d7d" : "var(--warn)" }}>
                    Line {iss.line}: {iss.message}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <label style={s.cardDesc}>
            Where is this from? (optional — shows in your import history)
            <input
              style={{ ...s.select, width: "100%", marginTop: 4 }}
              placeholder="e.g. TrainingPeaks export, old spreadsheet"
              value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)}
            />
          </label>

          <div style={s.btnRow}>
            <button style={s.ghost} onClick={() => setStep("map")}>← Back</button>
            <button
              style={{ ...s.primary, opacity: built.valid.length && !(remainingSeats != null && built.valid.length > remainingSeats) ? 1 : 0.5 }}
              disabled={busy || !built.valid.length || (remainingSeats != null && built.valid.length > remainingSeats)}
              onClick={commit}
            >
              {busy ? "Importing…" : `Import ${built.valid.length} athlete${built.valid.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Step: done ── */}
      {step === "done" && result && (
        <div style={s.card}>
          <div style={{ ...s.cardLabel, color: "var(--good)" }}>✓ Imported {result.created} athlete{result.created === 1 ? "" : "s"}</div>
          <div style={s.cardDesc}>
            They&apos;re in your roster now. If something looks wrong you can undo this whole
            import from the history below.
          </div>
          <div style={s.btnRow}>
            <button style={s.primary} onClick={() => router.push("/athletes")}>Go to Athletes</button>
            <button style={s.ghost} onClick={reset}>Import another file</button>
          </div>
        </div>
      )}

      {/* ── Import history ── */}
      {batches.length > 0 && (
        <div style={{ ...s.card, marginTop: 24 }}>
          <div style={s.cardLabel}>Import history</div>
          <div style={s.histList}>
            {batches.map((b) => (
              <div key={b.id} style={s.histRow}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s.histTitle}>
                    {b.created_count} {b.entity === "athletes" ? "athletes" : b.entity}
                    {b.source_label ? ` · ${b.source_label}` : b.filename ? ` · ${b.filename}` : ""}
                  </div>
                  <div style={s.histMeta}>
                    {new Date(b.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                    {b.status === "reverted" && <span style={{ color: "var(--mute)" }}> · reverted</span>}
                  </div>
                </div>
                {b.status === "complete" && b.entity === "athletes" && (
                  <button style={s.revertBtn} onClick={() => openRevert(b)}>Undo</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Revert confirm ── */}
      {revertTarget && (
        <div style={s.overlay} onClick={() => !busy && setRevertTarget(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.cardLabel}>Undo this import?</div>
            <div style={s.cardDesc}>
              This permanently deletes <strong>{revertTarget.impact.athletes} athlete{revertTarget.impact.athletes === 1 ? "" : "s"}</strong>
              {(revertTarget.impact.sessions > 0 || revertTarget.impact.personalBests > 0 || revertTarget.impact.testSessions > 0) ? (
                <> — and everything logged against them since:
                  {revertTarget.impact.sessions > 0 && <> {revertTarget.impact.sessions} session{revertTarget.impact.sessions === 1 ? "" : "s"},</>}
                  {revertTarget.impact.personalBests > 0 && <> {revertTarget.impact.personalBests} PB{revertTarget.impact.personalBests === 1 ? "" : "s"},</>}
                  {revertTarget.impact.testSessions > 0 && <> {revertTarget.impact.testSessions} test session{revertTarget.impact.testSessions === 1 ? "" : "s"},</>}
                  <> which will also be lost.</>
                </>
              ) : "."}
              {" "}This can&apos;t be undone.
            </div>
            <div style={s.btnRow}>
              <button style={s.ghost} onClick={() => setRevertTarget(null)} disabled={busy}>Cancel</button>
              <button style={{ ...s.primary, background: "#ff7d7d", color: "#2a0c0c" }} onClick={confirmRevert} disabled={busy}>
                {busy ? "Removing…" : "Delete them"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function stepIndex(s: Step): number {
  return ["upload", "map", "preview", "done"].indexOf(s);
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 720 },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, margin: "0 0 4px" },
  sub: { fontSize: 13, color: "var(--mute)", lineHeight: 1.5, margin: "0 0 20px", maxWidth: 560 },
  errBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 16 },
  steps: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" as const },
  stepPill: { fontSize: 12, fontWeight: 700, color: "var(--mute)", background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 20, padding: "5px 12px" },
  stepPillActive: { color: "var(--accent)", borderColor: "var(--accent)", background: "var(--accent-dim)" },
  stepPillDone: { color: "var(--good)", borderColor: "var(--good)" },
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 12 },
  cardLabel: { fontSize: 15, fontWeight: 700, color: "var(--text)" },
  cardDesc: { fontSize: 13, color: "var(--mute)", lineHeight: 1.5 },
  primary: { alignSelf: "flex-start", background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  ghost: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  templateLink: { fontSize: 13, fontWeight: 600, color: "var(--accent)", textDecoration: "none" },
  btnRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 6 },
  mapGrid: { display: "flex", flexDirection: "column" as const, gap: 8 },
  mapRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px" },
  mapField: { fontSize: 13, fontWeight: 700, color: "var(--text)" },
  mapHint: { fontSize: 11, color: "var(--mute)", marginTop: 2 },
  req: { color: "var(--accent)" },
  select: { background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "7px 10px", fontSize: 13, minWidth: 180, fontFamily: "inherit" },
  statsRow: { display: "flex", gap: 10, flexWrap: "wrap" as const },
  stat: { flex: "1 1 70px", background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 8px", textAlign: "center" as const },
  statVal: { fontSize: 17, fontWeight: 800, color: "var(--accent)" },
  statLbl: { fontSize: 10, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: 0.4, marginTop: 2 },
  previewTableWrap: { overflowX: "auto" as const },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 12 },
  th: { textAlign: "left" as const, fontSize: 10, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: 0.4, padding: "0 10px 6px", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" as const },
  td: { padding: "7px 10px", color: "var(--text)", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" as const },
  issues: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px" },
  issuesSummary: { fontSize: 12, fontWeight: 700, color: "var(--mute)", cursor: "pointer" },
  issuesList: { margin: "8px 0 0", paddingLeft: 18, fontSize: 12, lineHeight: 1.6, maxHeight: 200, overflowY: "auto" as const },
  histList: { display: "flex", flexDirection: "column" as const, gap: 6 },
  histRow: { display: "flex", alignItems: "center", gap: 10, background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 12px" },
  histTitle: { fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  histMeta: { fontSize: 11, color: "var(--mute)", marginTop: 2 },
  revertBtn: { background: "transparent", border: "1px solid var(--line)", color: "#ff7d7d", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 },
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", gap: 12 },
};

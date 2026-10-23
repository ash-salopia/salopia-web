import Papa from "papaparse";
import { normaliseDate } from "@/lib/import/roster";
import type { TestMetric } from "@/types";

// Testing results import - CSV / Excel exports (VALD ForceDecks, Hawkin,
// timing gates, a coach's own spreadsheet) and force plate PDF reports.
// Everything here is plain parsing and matching - no AI, no tokens.
//
// Both sources are turned into the same shape: a list of ImportRecords
// (one per row of the export, or one per PDF) holding raw values keyed
// by field, plus the list of fields found. The coach then maps fields
// to test metrics (remembered per organisation, see 0129) and the
// records are grouped into one test session per athlete per date.

export interface ImportField {
  key: string;            // stable id, also the remembered source_key
  label: string;          // as shown in the file
  baseLabel: string;      // label without unit / side markers
  testType: string | null;
  unit: string | null;    // unit found in the label, e.g. "cm"
  sideHint: "left" | "right" | null;
  samples: number[];      // first few values, for the coach to sanity-check
  count: number;          // how many records have a value
}

export interface ImportRecord {
  id: string;
  source: string;         // file name (+ row number for spreadsheets)
  athleteLabel: string;   // name as written in the file ("" if unknown)
  date: string | null;    // YYYY-MM-DD
  bodyweightKg: number | null;
  values: Record<string, number>; // field key -> raw value
}

export interface ParsedImport {
  fields: ImportField[];
  records: ImportRecord[];
}

// ── Small helpers ────────────────────────────────────────────────────────────

export function norm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_\s]+/g, " ")
    .trim();
}

export function parseNumber(raw: unknown): number | null {
  if (typeof raw === "number") return isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/,/g, "").replace(/%$/, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

// Dates often come with a time ("21/10/2026 10:42", "2026-10-21T10:42:00Z").
export function parseDate(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const datePart = s.split(/[T ]/)[0];
  return normaliseDate(datePart) ?? normaliseDate(s);
}

const UNIT_RE = /^(cm|mm|m|km|s|ms|n|kn|kg|g|lb|lbs|w|w\/kg|n\/kg|n\.?s|n s|n\/s|n\/s\/kg|m\/s|m\/s2|m\/s\^2|%|deg|°|j|j\/kg|bw|au|rsi|hz|bpm|km\/h|mph|reps?)$/i;

// Pulls "[cm]" / "(m)" units and "Left"/"(L)" side markers off a column label.
export function splitLabel(label: string): { base: string; unit: string | null; side: "left" | "right" | null } {
  let base = label.trim();
  let unit: string | null = null;
  let side: "left" | "right" | null = null;

  for (let i = 0; i < 3; i++) {
    const m = base.match(/[\s]*[[(]([^\])]+)[\])]\s*$/);
    if (!m) break;
    const inner = m[1].trim();
    if (!unit && UNIT_RE.test(inner)) unit = inner;
    else if (!side && /^(l|left)$/i.test(inner)) side = "left";
    else if (!side && /^(r|right)$/i.test(inner)) side = "right";
    else break;
    base = base.slice(0, m.index).trim();
  }
  if (!side) {
    const m = base.match(/^(left|right)\s+(.+)$/i) ?? base.match(/^(.+?)\s*[-–]?\s*\b(left|right|l|r)$/i);
    if (m) {
      const word = (/^(left|right)$/i.test(m[1]) ? m[1] : m[2]).toLowerCase();
      const rest = /^(left|right)$/i.test(m[1]) ? m[2] : m[1];
      side = word.startsWith("l") ? "left" : "right";
      base = rest.trim();
    }
  }
  return { base: base || label.trim(), unit, side };
}

const SCALES: Record<string, [string, number]> = {
  mm: ["length", 0.001], cm: ["length", 0.01], m: ["length", 1], km: ["length", 1000],
  ms: ["time", 0.001], s: ["time", 1],
  n: ["force", 1], kn: ["force", 1000],
  g: ["mass", 0.001], kg: ["mass", 1], lb: ["mass", 0.453592], lbs: ["mass", 0.453592],
};

// Multiplier from the file's unit to the metric's unit (m -> cm = 100).
// 1 when either is unknown or they're not the same kind of quantity.
export function unitScale(from: string | null, to: string | null): number {
  const a = SCALES[norm(from ?? "")];
  const b = SCALES[norm(to ?? "")];
  if (!a || !b || a[0] !== b[0]) return 1;
  return Math.round((a[1] / b[1]) * 1e6) / 1e6;
}

// ── Spreadsheet / CSV ───────────────────────────────────────────────────────

export interface Table {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsvText(text: string): Table {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length && !parsed.data.length) {
    throw new Error("Could not read that file - check it's a CSV with a header row.");
  }
  const headers = (parsed.meta.fields ?? []).filter((h) => h && h.trim() !== "");
  const rows = (parsed.data ?? []).filter((r) => Object.values(r).some((v) => (v ?? "").toString().trim() !== ""));
  return { headers, rows };
}

export async function readTableFile(file: File): Promise<Table> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: false });
    // First sheet with a header row and data.
    for (const name of wb.SheetNames) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
      if (!csv.replace(/[,\s]/g, "")) continue;
      const t = parseCsvText(csv);
      if (t.headers.length && t.rows.length) return t;
    }
    throw new Error("That spreadsheet looks empty.");
  }
  return parseCsvText(await file.text());
}

export type IdentityColumns = {
  athlete: string | null;
  firstName: string | null;
  lastName: string | null;
  date: string | null;
  testType: string | null;
  bodyweight: string | null;
};

const ID_ALIASES: Record<keyof IdentityColumns, string[]> = {
  athlete: ["name", "athlete", "athlete name", "full name", "player", "player name", "profile", "profile name", "client", "client name"],
  firstName: ["first name", "firstname", "given name", "forename"],
  lastName: ["last name", "lastname", "surname", "family name"],
  date: ["date", "test date", "session date", "date recorded", "recorded", "timestamp", "date time", "datetime", "date & time", "test date utc"],
  testType: ["test type", "test", "test name", "type", "trial type", "movement"],
  bodyweight: ["bw kg", "bw", "body weight", "bodyweight", "body mass", "mass", "weight", "body weight kg", "bodyweight kg", "system weight kg"],
};

function headerKey(h: string): string {
  return norm(h).replace(/[[\]()]/g, " ").replace(/\s+/g, " ").trim();
}

export function detectIdentityColumns(headers: string[]): IdentityColumns {
  const found: IdentityColumns = { athlete: null, firstName: null, lastName: null, date: null, testType: null, bodyweight: null };
  const used = new Set<string>();
  for (const role of Object.keys(ID_ALIASES) as (keyof IdentityColumns)[]) {
    const aliases = ID_ALIASES[role];
    const hit = headers.find((h) => !used.has(h) && aliases.includes(headerKey(h)));
    if (hit) {
      found[role] = hit;
      used.add(hit);
    }
  }
  // Looser date pass: any header containing "date".
  if (!found.date) {
    const hit = headers.find((h) => !used.has(h) && /\bdate\b/.test(headerKey(h)));
    if (hit) { found.date = hit; used.add(hit); }
  }
  return found;
}

function isIdLikeHeader(h: string): boolean {
  const k = headerKey(h);
  return /^(id|uuid|external id|athlete id|profile id|rep|reps|trial|trial no|trial number|attempt|time|time utc|tags?|notes?|comments?|device|sport|position|group|team|squad|sex|gender|dob|date of birth|age|height|excluded|valid|additional load kg|additional load)$/.test(k);
}

export function tableToImport(table: Table, idCols: IdentityColumns, sourceName: string): ParsedImport {
  const identity = new Set(Object.values(idCols).filter(Boolean) as string[]);
  const metricHeaders = table.headers.filter((h) => !identity.has(h) && !isIdLikeHeader(h));

  const fieldsByKey = new Map<string, ImportField>();
  const records: ImportRecord[] = [];

  table.rows.forEach((row, i) => {
    const athleteLabel = idCols.athlete
      ? (row[idCols.athlete] ?? "").trim()
      : [idCols.firstName && row[idCols.firstName], idCols.lastName && row[idCols.lastName]].filter(Boolean).join(" ").trim();
    const testType = idCols.testType ? (row[idCols.testType] ?? "").trim() || null : null;
    const values: Record<string, number> = {};
    for (const h of metricHeaders) {
      const n = parseNumber(row[h]);
      if (n === null) continue;
      const { base, unit, side } = splitLabel(h);
      const key = (testType ? `${norm(testType)}::` : "") + norm(h);
      values[key] = n;
      let f = fieldsByKey.get(key);
      if (!f) {
        f = { key, label: h, baseLabel: base, testType, unit, sideHint: side, samples: [], count: 0 };
        fieldsByKey.set(key, f);
      }
      f.count++;
      if (f.samples.length < 3) f.samples.push(n);
    }
    records.push({
      id: `${sourceName}#${i + 2}`,
      source: `${sourceName}, row ${i + 2}`,
      athleteLabel,
      date: idCols.date ? parseDate(row[idCols.date] ?? "") : null,
      bodyweightKg: idCols.bodyweight ? parseNumber(row[idCols.bodyweight]) : null,
      values,
    });
  });

  return { fields: sortFields([...fieldsByKey.values()]), records };
}

// Grouped by test type, otherwise in file order (sort is stable).
function sortFields(fields: ImportField[]): ImportField[] {
  return fields.sort((a, b) => (a.testType ?? "").localeCompare(b.testType ?? ""));
}

// ── PDF (text only, read on the device) ─────────────────────────────────────

// Rebuilds the visual lines of each page from the PDF's positioned text,
// so "Jump Height  32.5 cm" stays on one line even when the PDF stores
// the label and value as separate pieces. Scanned PDFs (images) have no
// text to read - the caller reports that.
export async function readPdfLines(file: File): Promise<string[]> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const lines: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items as { str?: string; transform?: number[] }[]) {
      if (!item.str || !item.str.trim() || !item.transform) continue;
      const y = Math.round(item.transform[5] / 3) * 3;
      const x = item.transform[4];
      (rows.get(y) ?? rows.set(y, []).get(y)!).push({ x, s: item.str.trim() });
    }
    const ys = [...rows.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const line = rows.get(y)!.sort((a, b) => a.x - b.x).map((r) => r.s).join("  ");
      if (line.trim()) lines.push(line.replace(/\s{3,}/g, "  ").trim());
    }
  }
  return lines;
}

const NUM_TOKEN = /^[-+]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?%?$/;

// Finds "label  value [unit]  value [unit] ..." lines. Each value on a
// line becomes its own field ("Peak Force · value 2") so a table row like
// "Peak Force  1850  1790  3.3%" can be mapped as Left / Right / ignore.
export function pdfLinesToImport(lines: string[], sourceName: string, knownNames: string[]): ParsedImport {
  const fields: ImportField[] = [];
  const values: Record<string, number> = {};
  const seen = new Map<string, number>();
  let date: string | null = null;
  let bodyweightKg: number | null = null;
  // Column headings of a results table ("Left  Right  Asym", "Trial 1
  // Trial 2 Trial 3"), used to label the values on the rows below it.
  let columns: string[] | null = null;

  for (const line of lines) {
    if (!date) {
      const m = line.match(/\b(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})\b/);
      if (m) date = parseDate(m[1]);
    }
    const tokens = line.split(/\s+/);
    const heads = tableColumns(line);
    if (heads) { columns = heads; continue; }
    const firstNum = tokens.findIndex((t) => NUM_TOKEN.test(t) && /\d/.test(t));
    if (firstNum <= 0) continue;
    const label = tokens.slice(0, firstNum).join(" ").replace(/[:\-–|]+$/, "").trim();
    if (!/[a-z]/i.test(label) || label.length > 70) continue;
    // Skip date-ish / page furniture lines.
    if (/\b(date|dob|page|printed|generated|age)\b/i.test(label) || /^(time|report)\b/i.test(label)) continue;

    const nums: { n: number; unit: string | null }[] = [];
    for (let i = firstNum; i < tokens.length; i++) {
      const t = tokens[i];
      if (NUM_TOKEN.test(t) && /\d/.test(t)) {
        const n = parseNumber(t);
        if (n === null) continue;
        const next = tokens[i + 1];
        const unit = t.endsWith("%") ? "%" : next && UNIT_RE.test(next) ? next : null;
        nums.push({ n, unit });
      } else if (!UNIT_RE.test(t)) {
        break; // text again - the value run is over
      }
    }
    if (!nums.length || nums.length > 8) continue;

    const split = splitLabel(label);
    if (/^(body ?weight|bw|body ?mass|system weight)$/i.test(split.base) && bodyweightKg === null) {
      const kg = nums[0].unit && /^lbs?$/i.test(nums[0].unit) ? nums[0].n * 0.453592 : nums[0].n;
      if (kg > 15 && kg < 250) bodyweightKg = Math.round(kg * 10) / 10;
    }

    const occurrence = (seen.get(norm(label)) ?? 0) + 1;
    seen.set(norm(label), occurrence);
    const dup = occurrence > 1 ? ` (${occurrence})` : "";
    const heads2 = columns && columns.length === nums.length ? columns : null;
    nums.forEach(({ n, unit }, i) => {
      const head = heads2?.[i] ?? null;
      const suffix = head ? ` · ${head}` : nums.length > 1 ? ` · value ${i + 1}` : "";
      const headSide = head && /^(l|left)$/i.test(head) ? "left" : head && /^(r|right)$/i.test(head) ? "right" : null;
      const isAsym = !!head && /asym|imbalance|diff/i.test(head);
      const key = `pdf::${norm(label)}${dup}${nums.length > 1 ? `#${i + 1}` : ""}`;
      values[key] = n;
      fields.push({
        key,
        label: `${label}${dup}${suffix}`,
        baseLabel: isAsym ? `${split.base} Asymmetry` : split.base,
        testType: null,
        unit: unit ?? split.unit,
        sideHint: headSide ?? split.side,
        samples: [n],
        count: 1,
      });
    });
  }

  // Athlete: the longest known athlete name that appears in the text.
  const text = norm(lines.join(" "));
  const athleteLabel = [...knownNames]
    .sort((a, b) => b.length - a.length)
    .find((n) => n.trim() && text.includes(norm(n))) ?? "";

  return {
    fields,
    records: [{ id: sourceName, source: sourceName, athleteLabel, date, bodyweightKg, values }],
  };
}

const COLUMN_WORD = /^(l|left|r|right|asym|asym%|asymmetry|imbalance|diff|difference|mean|avg|average|best|total|both|bilateral|trial|rep|attempt|\d|#\d)$/i;

// A heading row: no numbers except "Trial 1"-style ones, and every word
// after the first is a column word. Returns the column labels.
function tableColumns(line: string): string[] | null {
  const parts = line.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const cols = parts.slice(1);
  const ok = cols.every((c) => c.split(/\s+/).every((w) => COLUMN_WORD.test(w.replace(/[()%]/g, "") || "%")));
  return ok && cols.some((c) => /[a-z]/i.test(c)) ? cols : null;
}

// Combine several parsed files (e.g. a batch of PDFs) into one import.
export function mergeImports(parts: ParsedImport[]): ParsedImport {
  const byKey = new Map<string, ImportField>();
  for (const p of parts) {
    for (const f of p.fields) {
      const ex = byKey.get(f.key);
      if (!ex) byKey.set(f.key, { ...f, samples: [...f.samples] });
      else {
        ex.count += f.count;
        for (const s of f.samples) if (ex.samples.length < 3) ex.samples.push(s);
      }
    }
  }
  return { fields: [...byKey.values()], records: parts.flatMap((p) => p.records) };
}

// ── Matching ────────────────────────────────────────────────────────────────

export interface FieldMapping {
  metricId: string | null;  // null = ignore; NEW_METRIC = create one
  side: "left" | "right" | null;
  scale: number;
}

export const NEW_METRIC = "__new__";

// Common force plate / testing names that mean the same thing.
const ALIAS_GROUPS: string[][] = [
  ["cmj", "cmj height", "cmj jump height", "countermovement jump", "countermovement jump height", "jump height", "jump height imp-mom", "jump height (imp-mom)", "jump height flight time", "jump height (flight time)"],
  ["rsi mod", "rsi-mod", "rsi modified", "rsi-modified", "rsimod", "mrsi", "modified rsi", "reactive strength index modified"],
  ["rsi", "reactive strength index"],
  ["imtp", "imtp peak force", "peak force", "peak vertical force", "isometric mid-thigh pull"],
  ["imtp relative", "imtp relative peak force", "relative peak force", "peak force / bw", "peak force bw", "peak relative force"],
  ["peak power", "peak propulsive power", "peak power w"],
  ["relative peak power", "peak power / bw", "peak power bw", "peak relative propulsive power", "relative peak propulsive power"],
  ["contact time", "ground contact time", "gct"],
  ["flight time"],
  ["squat jump", "sj", "sj height", "squat jump height", "sj jump height"],
  ["drop jump", "dj", "dj height", "drop jump height", "dj jump height"],
];

function aliasGroup(label: string): number {
  const k = norm(label).replace(/[()[\]]/g, "").replace(/\s+/g, " ").trim();
  if (!k) return -1;
  return ALIAS_GROUPS.findIndex((g) => g.some((a) => norm(a).replace(/[()[\]]/g, "").replace(/\s+/g, " ").trim() === k));
}

// Best guess for a field when nothing is remembered: an exact name match
// (ignoring units, case, side), else the same alias group - but only for
// CMJ-type metrics when the export says it's a CMJ, so a squat jump's
// "Jump Height" doesn't land on the CMJ metric.
export function suggestMetric(field: ImportField, metrics: TestMetric[]): TestMetric | null {
  const base = norm(field.baseLabel);
  const typePrefixed = field.testType ? norm(`${field.testType} ${field.baseLabel}`) : null;
  const exact = metrics.find((m) => {
    const mn = norm(splitLabel(m.name).base);
    return mn === base || (typePrefixed !== null && mn === typePrefixed);
  });
  if (exact) return exact;

  // Try the label as-is, without its "(Imp-Mom)"-style qualifier, and
  // prefixed with the test type ("SJ" + "Jump Height").
  const plain = field.baseLabel.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const candidates = [field.baseLabel, plain, field.testType ? `${field.testType} ${plain}` : ""];
  const g = field.testType && aliasGroup(candidates[2]) >= 0
    ? aliasGroup(candidates[2])
    : candidates.map(aliasGroup).find((x) => x >= 0) ?? -1;
  if (g < 0) return null;
  const type = norm(field.testType ?? "");
  // "Jump Height" alone is only a CMJ height if the test is a CMJ (or unknown).
  if (g === 0 && /^jump height/.test(base) && type && !/cmj|counter/.test(type)) return null;
  return metrics.find((m) => aliasGroup(splitLabel(m.name).base) === g) ?? null;
}

export function defaultMapping(field: ImportField, metric: TestMetric | null): FieldMapping {
  if (!metric) return { metricId: null, side: null, scale: 1 };
  return {
    metricId: metric.id,
    side: metric.is_bilateral ? field.sideHint : null,
    scale: unitScale(field.unit, metric.unit),
  };
}

// Athlete name matching: exact, "Surname, First" swapped, then
// first+last ignoring middle names.
export function matchAthlete<T extends { id: string; name: string }>(label: string, athletes: T[]): T | null {
  const l = norm(label).replace(/\s+/g, " ");
  if (!l) return null;
  const byName = (n: string) => athletes.find((a) => norm(a.name).replace(/\s+/g, " ") === n) ?? null;
  const exact = byName(l);
  if (exact) return exact;
  if (l.includes(",")) {
    const [last, first] = l.split(",").map((s) => s.trim());
    const swapped = byName(`${first} ${last}`);
    if (swapped) return swapped;
  }
  const parts = l.replace(",", " ").split(" ").filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    return athletes.find((a) => {
      const p = norm(a.name).split(" ").filter(Boolean);
      return p.length >= 2 && ((p[0] === first && p[p.length - 1] === last) || (p[0] === last && p[p.length - 1] === first));
    }) ?? null;
  }
  return null;
}

// ── Building sessions ───────────────────────────────────────────────────────

export interface PlannedResult {
  metricId: string;          // may be a NEW_METRIC placeholder id ("new:<key>")
  side: "left" | "right" | null;
  values: number[];          // trials, in file order
}

export interface PlannedSession {
  athleteId: string;
  date: string;
  bodyweightKg: number | null;
  sources: string[];
  results: PlannedResult[];
}

export interface BuildOutcome {
  sessions: PlannedSession[];
  skipped: { source: string; reason: string }[];
}

const round = (n: number) => Math.round(n * 10000) / 10000;

export function buildSessions(
  parsed: ParsedImport,
  mapping: Record<string, FieldMapping>,
  athleteFor: (record: ImportRecord) => string | null,
  dateFor: (record: ImportRecord) => string | null,
  metricIdFor: (fieldKey: string, m: FieldMapping) => string | null
): BuildOutcome {
  const sessions = new Map<string, PlannedSession>();
  const skipped: BuildOutcome["skipped"] = [];

  for (const r of parsed.records) {
    const athleteId = athleteFor(r);
    const date = dateFor(r);
    if (!athleteId) { skipped.push({ source: r.source, reason: r.athleteLabel ? `"${r.athleteLabel}" isn't matched to an athlete` : "no athlete" }); continue; }
    if (!date) { skipped.push({ source: r.source, reason: "no test date" }); continue; }

    const results: { metricId: string; side: "left" | "right" | null; value: number }[] = [];
    for (const [key, raw] of Object.entries(r.values)) {
      const m = mapping[key];
      if (!m || !m.metricId) continue;
      const metricId = metricIdFor(key, m);
      if (!metricId) continue;
      results.push({ metricId, side: m.side, value: round(raw * (m.scale || 1)) });
    }
    if (!results.length) { skipped.push({ source: r.source, reason: "no matched results" }); continue; }

    const sk = `${athleteId}|${date}`;
    let s = sessions.get(sk);
    if (!s) {
      s = { athleteId, date, bodyweightKg: null, sources: [], results: [] };
      sessions.set(sk, s);
    }
    s.sources.push(r.source);
    if (r.bodyweightKg && r.bodyweightKg > 15 && r.bodyweightKg < 250 && s.bodyweightKg === null) {
      s.bodyweightKg = Math.round(r.bodyweightKg * 10) / 10;
    }
    for (const res of results) {
      let pr = s.results.find((x) => x.metricId === res.metricId && x.side === res.side);
      if (!pr) {
        pr = { metricId: res.metricId, side: res.side, values: [] };
        s.results.push(pr);
      }
      pr.values.push(res.value);
    }
  }

  return { sessions: [...sessions.values()], skipped };
}

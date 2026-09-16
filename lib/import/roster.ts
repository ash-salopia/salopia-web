import Papa from "papaparse";

// Roster CSV import — parsing, column auto-detection, and row
// validation/normalisation. Runs client-side (same as lib/csv-import.ts);
// the actual DB write is lib/data/import.ts -> commitRosterImport.
//
// The flow the UI drives:
//   1. parseRosterCsv(file)            -> { headers, rows }
//   2. autoDetectMapping(headers)      -> best-guess { field: header }
//   3. coach adjusts the mapping in a dropdown-per-field UI
//   4. buildRosterRows(rows, mapping)  -> { valid, issues }  (preview)
//   5. commitRosterImport(valid, ...)  (lib/data/import.ts)

export type RosterField =
  | "name"
  | "group"
  | "sex"
  | "date_of_birth"
  | "bodyweight_kg"
  | "max_hr"
  | "resting_hr"
  | "mas_kmh";

export interface RosterFieldDef {
  field: RosterField;
  label: string;
  required: boolean;
  hint: string;
  // Header spellings we'll auto-map from (lower-cased, exact match after trim).
  aliases: string[];
}

export const ROSTER_FIELDS: RosterFieldDef[] = [
  { field: "name", label: "Full name", required: true, hint: "First and last name in one column",
    aliases: ["name", "full name", "fullname", "athlete", "athlete name", "player", "player name", "client", "client name"] },
  { field: "group", label: "Group / squad", required: false, hint: "e.g. U16, First Team, Sprint Squad",
    aliases: ["group", "squad", "team", "training group", "cohort", "class"] },
  { field: "sex", label: "Sex", required: false, hint: "male / female (M / F also accepted)",
    aliases: ["sex", "gender", "m/f"] },
  { field: "date_of_birth", label: "Date of birth", required: false, hint: "Any common format — DD/MM/YYYY, YYYY-MM-DD, etc.",
    aliases: ["date of birth", "dob", "birth date", "birthdate", "birthday", "d.o.b.", "d.o.b"] },
  { field: "bodyweight_kg", label: "Bodyweight (kg)", required: false, hint: "Number in kilograms",
    aliases: ["bodyweight", "body weight", "weight", "bodyweight kg", "weight kg", "mass", "bw"] },
  { field: "max_hr", label: "Max HR", required: false, hint: "Max heart rate in bpm",
    aliases: ["max hr", "maxhr", "max heart rate", "hr max", "hrmax", "maximum heart rate"] },
  { field: "resting_hr", label: "Resting HR", required: false, hint: "Resting heart rate in bpm",
    aliases: ["resting hr", "restinghr", "resting heart rate", "hr rest", "rhr"] },
  { field: "mas_kmh", label: "MAS (km/h)", required: false, hint: "Maximal Aerobic Speed in km/h",
    aliases: ["mas", "mas kmh", "mas km/h", "maximal aerobic speed", "max aerobic speed"] },
];

export type ColumnMapping = Partial<Record<RosterField, string>>; // field -> CSV header

export interface ParsedRosterCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseRosterCsv(text: string): ParsedRosterCsv {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length && !parsed.data.length) {
    throw new Error("Could not read that CSV — check it's a valid, comma-separated file with a header row.");
  }
  const headers = (parsed.meta.fields ?? []).filter((h) => h && h.trim() !== "");
  const rows = (parsed.data ?? []).filter((r) =>
    Object.values(r).some((v) => (v ?? "").trim() !== "")
  );
  return { headers, rows };
}

// Best-guess mapping from the file's headers. Exact alias match first,
// then a loose "header contains alias / alias contains header" pass.
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  const norm = (s: string) => s.trim().toLowerCase();

  for (const def of ROSTER_FIELDS) {
    const exact = headers.find((h) => !used.has(h) && def.aliases.includes(norm(h)));
    if (exact) {
      mapping[def.field] = exact;
      used.add(exact);
      continue;
    }
    const loose = headers.find(
      (h) =>
        !used.has(h) &&
        def.aliases.some((a) => {
          const nh = norm(h);
          return nh.includes(a) || a.includes(nh);
        })
    );
    if (loose) {
      mapping[def.field] = loose;
      used.add(loose);
    }
  }
  return mapping;
}

// ── Normalisers ──────────────────────────────────────────────────────

export function normaliseSex(raw: string): "male" | "female" | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (["m", "male", "man", "boy", "b"].includes(s)) return "male";
  if (["f", "female", "woman", "girl", "g", "w"].includes(s)) return "female";
  return null;
}

// Parse a date from the formats a competitor export actually uses.
// Returns YYYY-MM-DD or null. Ambiguous D/M vs M/D is resolved as
// day-first (UK convention — Ash's user base), except where a value
// > 12 forces the other reading.
export function normaliseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // ISO-ish: YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return isoOrNull(+m[1], +m[2], +m[3]);

  // D/M/Y or M/D/Y with 4-digit year
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    let [d, mo] = [+m[1], +m[2]];
    if (d <= 12 && mo > 12) [d, mo] = [mo, d]; // clearly month-first
    return isoOrNull(+m[3], mo, d);
  }

  // D/M/Y or M/D/Y with 2-digit year (assume 19xx for >= 30, else 20xx)
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (m) {
    let [d, mo] = [+m[1], +m[2]];
    if (d <= 12 && mo > 12) [d, mo] = [mo, d];
    const yy = +m[3];
    const year = yy >= 30 ? 1900 + yy : 2000 + yy;
    return isoOrNull(year, mo, d);
  }

  // "12 Mar 2004" / "March 12, 2004" / "12 March 04"
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) {
    const dt = new Date(parsed);
    return isoOrNull(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  }
  return null;
}

function isoOrNull(y: number, mo: number, d: number): string | null {
  if (!(y >= 1900 && y <= 2100) || !(mo >= 1 && mo <= 12) || !(d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function normaliseNumber(raw: string): number | null {
  const n = parseFloat(raw.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// ── Row building + validation ────────────────────────────────────────

export interface RosterRow {
  name: string;
  group: string;
  sex: "male" | "female" | null;
  date_of_birth: string | null;
  bodyweight_kg: number | null;
  max_hr: number | null;
  resting_hr: number | null;
  mas_kmh: number | null;
}

export interface RowIssue {
  line: number; // 1-based row number in the file (excluding header)
  level: "error" | "warning";
  message: string;
}

export interface BuiltRoster {
  valid: RosterRow[];
  issues: RowIssue[];
  // Names that appear more than once in the file, or already exist in
  // the org — surfaced so the coach can decide before committing.
  duplicateNames: string[];
}

export function buildRosterRows(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  existingNames: string[] = []
): BuiltRoster {
  const valid: RosterRow[] = [];
  const issues: RowIssue[] = [];
  const seen = new Map<string, number>();
  const existing = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const dupes = new Set<string>();

  const get = (r: Record<string, string>, f: RosterField): string => {
    const header = mapping[f];
    return header ? (r[header] ?? "").trim() : "";
  };

  rows.forEach((r, i) => {
    const line = i + 1;
    const name = get(r, "name").replace(/\s+/g, " ").trim();
    if (!name) {
      issues.push({ line, level: "error", message: "No name — row skipped" });
      return;
    }

    const key = name.toLowerCase();
    if (seen.has(key)) {
      dupes.add(name);
      issues.push({ line, level: "warning", message: `"${name}" also appears on line ${seen.get(key)}` });
    } else {
      seen.set(key, line);
    }
    if (existing.has(key)) {
      dupes.add(name);
      issues.push({ line, level: "warning", message: `"${name}" already exists in your roster — a second athlete will be created` });
    }

    const sexRaw = get(r, "sex");
    const sex = normaliseSex(sexRaw);
    if (sexRaw && !sex) issues.push({ line, level: "warning", message: `Couldn't read sex "${sexRaw}" — left blank` });

    const dobRaw = get(r, "date_of_birth");
    const date_of_birth = normaliseDate(dobRaw);
    if (dobRaw && !date_of_birth) issues.push({ line, level: "warning", message: `Couldn't read date of birth "${dobRaw}" — left blank` });

    const num = (f: RosterField, label: string, lo: number, hi: number): number | null => {
      const raw = get(r, f);
      if (!raw) return null;
      const n = normaliseNumber(raw);
      if (n == null) { issues.push({ line, level: "warning", message: `Couldn't read ${label} "${raw}" — left blank` }); return null; }
      if (n < lo || n > hi) { issues.push({ line, level: "warning", message: `${label} "${raw}" looks out of range — left blank` }); return null; }
      return n;
    };

    valid.push({
      name,
      group: get(r, "group"),
      sex,
      date_of_birth,
      bodyweight_kg: num("bodyweight_kg", "bodyweight", 20, 300),
      max_hr: num("max_hr", "max HR", 120, 230),
      resting_hr: num("resting_hr", "resting HR", 25, 120),
      mas_kmh: num("mas_kmh", "MAS", 8, 30),
    });
  });

  return { valid, issues, duplicateNames: [...dupes] };
}

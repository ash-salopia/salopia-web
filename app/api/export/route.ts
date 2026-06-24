import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExportOptions {
  athleteId: "all" | string;
  format: "csv" | "json";
  fields: string[];
  dateFrom?: string;
  dateTo?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseWeight(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseReps(s: string): number {
  if (!s) return 0;
  const match = s.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsvRow(values: (string | number | null | undefined)[]): string {
  return values.map(csvEscape).join(",");
}

// ── Main data fetch ───────────────────────────────────────────────────────────

async function fetchExportData(opts: ExportOptions) {
  const supabase = await createClient();

  // Build sessions query
  let sessionQuery = supabase
    .from("sessions")
    .select(`
      id, name, date, type,
      athletes(id, name),
      session_exercises(
        id, name, sets, reps, time, target_load, tempo, notes, session_notes, progress, sort_order, log
      )
    `)
    .order("date", { ascending: true });

  if (opts.athleteId !== "all") {
    sessionQuery = sessionQuery.eq("athlete_id", opts.athleteId);
  }
  if (opts.dateFrom) sessionQuery = sessionQuery.gte("date", opts.dateFrom);
  if (opts.dateTo) sessionQuery = sessionQuery.lte("date", opts.dateTo);

  const { data: sessions, error: sessErr } = await sessionQuery;
  if (sessErr) throw sessErr;

  // PBs if selected
  let pbs: any[] = [];
  if (opts.fields.includes("pbs")) {
    let pbQuery = supabase
      .from("personal_bests")
      .select("*, athletes(name)")
      .order("date", { ascending: true });
    if (opts.athleteId !== "all") pbQuery = pbQuery.eq("athlete_id", opts.athleteId);
    if (opts.dateFrom) pbQuery = pbQuery.gte("date", opts.dateFrom);
    if (opts.dateTo) pbQuery = pbQuery.lte("date", opts.dateTo);
    const { data } = await pbQuery;
    pbs = data ?? [];
  }

  // Programme assignments if selected
  let programmeAssignments: any[] = [];
  if (opts.fields.includes("programme")) {
    let progQuery = supabase
      .from("programme_assignments")
      .select("athlete_id, programmes(name)");
    if (opts.athleteId !== "all") progQuery = progQuery.eq("athlete_id", opts.athleteId);
    const { data } = await progQuery;
    programmeAssignments = data ?? [];
  }

  return { sessions: sessions ?? [], pbs, programmeAssignments };
}

// ── CSV builder ───────────────────────────────────────────────────────────────

function buildCSV(data: any, opts: ExportOptions): string {
  const { sessions, pbs, programmeAssignments } = data;
  const f = opts.fields;

  // Build programme lookup: athleteId → programme names
  const progByAthlete = new Map<string, string[]>();
  for (const pa of programmeAssignments) {
    const prog = Array.isArray(pa.programmes) ? pa.programmes[0] : pa.programmes;
    const name = prog?.name;
    if (!name) continue;
    const athleteId = pa.athlete_id;
    if (!progByAthlete.has(athleteId)) progByAthlete.set(athleteId, []);
    progByAthlete.get(athleteId)!.push(name);
  }

  const lines: string[] = [];

  // ── Section 1: Session / Set data ──────────────────────────────────────────

  lines.push("SECTION: SESSION DATA");

  // Build header
  const headers = [
    "Athlete Name",
    "Session Date",
    "Session Name",
    "Exercise Name",
    "Set Number",
    "Prescribed Sets",
  ];
  if (f.includes("reps")) headers.push("Prescribed Reps", "Logged Reps");
  if (f.includes("weight")) headers.push("Prescribed Load", "Logged Weight (kg)");
  headers.push("Set Completed");
  if (f.includes("volume")) headers.push("Set Volume (kg)", "Session Total Volume (kg)");
  if (f.includes("programme")) headers.push("Programme(s)");
  if (f.includes("summary")) headers.push("AI Session Summary");
  if (f.includes("notes")) headers.push("Exercise Notes", "Athlete Set Note", "Progress Flag");

  lines.push(buildCsvRow(headers));

  // Rows
  for (const session of sessions) {
    const athlete = Array.isArray(session.athletes) ? session.athletes[0] : session.athletes;
    const athleteName = athlete?.name ?? "";
    const athleteId = athlete?.id ?? "";
    const exercises = (session.session_exercises ?? []).sort(
      (a: any, b: any) => a.sort_order - b.sort_order
    );
    const programmes = progByAthlete.get(athleteId)?.join("; ") ?? "";
    const summary = (session as any).coach_summary ?? "";

    for (const ex of exercises) {
      const log: Array<{ weight: string; reps: string; done: boolean }> = ex.log ?? [];

      // Calculate session total volume for this exercise
      let exVolume = 0;
      for (const set of log) {
        if (!set.done) continue;
        const w = parseWeight(set.weight);
        const r = parseReps(set.reps) || parseReps(ex.reps ?? "");
        if (w > 0 && r > 0) exVolume += w * r;
      }

      for (let i = 0; i < log.length; i++) {
        const set = log[i];
        const w = parseWeight(set.weight);
        const r = parseReps(set.reps);
        const setVolume = w > 0 && r > 0 ? w * r : w > 0 && parseReps(ex.reps) > 0 ? w * parseReps(ex.reps) : 0;

        const row: (string | number | null)[] = [
          athleteName,
          session.date,
          session.name,
          ex.name,
          i + 1,
          ex.sets ?? "",
        ];

        if (f.includes("reps")) {
          row.push(ex.reps ?? ex.time ?? "", set.reps ?? "");
        }
        if (f.includes("weight")) {
          row.push(ex.target_load ?? "", w > 0 ? w : "");
        }
        row.push(set.done ? "Yes" : "No");
        if (f.includes("volume")) {
          row.push(setVolume > 0 ? setVolume : "", exVolume > 0 ? exVolume : "");
        }
        if (f.includes("programme")) row.push(programmes);
        if (f.includes("summary")) row.push(i === 0 ? summary : ""); // only on first set row
        if (f.includes("notes")) {
          row.push(i === 0 ? (ex.notes ?? "") : "");
          row.push(set.done && (set as any).notes ? (set as any).notes : "");
          row.push(i === 0 ? (ex.progress ?? "") : "");
        }

        lines.push(buildCsvRow(row));
      }
    }
  }

  // ── Section 2: Personal Bests ───────────────────────────────────────────────

  if (f.includes("pbs") && pbs.length > 0) {
    lines.push("");
    lines.push("SECTION: PERSONAL BESTS");
    lines.push(buildCsvRow(["Athlete Name", "Exercise", "Best Weight (kg)", "Reps", "Date"]));
    for (const pb of pbs) {
      const athlete = Array.isArray(pb.athletes) ? pb.athletes[0] : pb.athletes;
      lines.push(buildCsvRow([
        athlete?.name ?? "",
        pb.exercise_name,
        pb.weight_kg ?? "",
        pb.reps ?? "",
        pb.date,
      ]));
    }
  }

  return lines.join("\n");
}

// ── JSON builder ──────────────────────────────────────────────────────────────

function buildJSON(data: any, opts: ExportOptions): string {
  const { sessions, pbs, programmeAssignments } = data;
  const f = opts.fields;

  // Group by athlete
  const athleteMap = new Map<string, any>();

  const progByAthlete = new Map<string, string[]>();
  for (const pa of programmeAssignments) {
    const prog = Array.isArray(pa.programmes) ? pa.programmes[0] : pa.programmes;
    const name = prog?.name;
    if (!name) continue;
    if (!progByAthlete.has(pa.athlete_id)) progByAthlete.set(pa.athlete_id, []);
    progByAthlete.get(pa.athlete_id)!.push(name);
  }

  for (const session of sessions) {
    const athlete = Array.isArray(session.athletes) ? session.athletes[0] : session.athletes;
    const athleteId = athlete?.id ?? "unknown";
    const athleteName = athlete?.name ?? "Unknown";

    if (!athleteMap.has(athleteId)) {
      athleteMap.set(athleteId, {
        id: athleteId,
        name: athleteName,
        programmes: progByAthlete.get(athleteId) ?? [],
        sessions: [],
        personal_bests: [],
      });
    }

    const exercises = (session.session_exercises ?? [])
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((ex: any) => {
        const log: Array<{ weight: string; reps: string; done: boolean }> = ex.log ?? [];
        const completedSets = log.filter((s) => s.done).length;

        let totalVolume = 0;
        const setData = log.map((set, i) => {
          const w = parseWeight(set.weight);
          const r = parseReps(set.reps) || parseReps(ex.reps ?? "");
          const vol = w > 0 && r > 0 ? w * r : 0;
          totalVolume += vol;

          const s: any = {
            set_number: i + 1,
            completed: set.done,
          };
          if (f.includes("weight") && w > 0) s.weight_kg = w;
          if (f.includes("reps") && set.reps) s.reps_logged = parseReps(set.reps);
          if (f.includes("volume") && vol > 0) s.volume_kg = vol;
          return s;
        });

        const exerciseObj: any = {
          name: ex.name,
          prescribed_sets: ex.sets,
          sets_completed: completedSets,
          sets_total: log.length,
        };
        if (f.includes("reps")) exerciseObj.prescribed_reps = ex.reps ?? ex.time ?? null;
        if (f.includes("weight")) exerciseObj.prescribed_load = ex.target_load ?? null;
        if (f.includes("volume") && totalVolume > 0) exerciseObj.total_volume_kg = totalVolume;
        exerciseObj.sets = setData;
        if (f.includes("notes")) {
          if (ex.notes) exerciseObj.notes = ex.notes;
          if (ex.progress) exerciseObj.progress = ex.progress;
        }
        return exerciseObj;
      });

    const sessionObj: any = {
      id: session.id,
      name: session.name,
      date: session.date,
      type: session.type,
      exercises,
    };
    if (f.includes("summary") && (session as any).coach_summary) {
      sessionObj.ai_summary = (session as any).coach_summary;
    }

    athleteMap.get(athleteId).sessions.push(sessionObj);
  }

  // Attach PBs
  if (f.includes("pbs")) {
    for (const pb of pbs) {
      const athlete = Array.isArray(pb.athletes) ? pb.athletes[0] : pb.athletes;
      const athleteId = athlete?.id;
      if (athleteId && athleteMap.has(athleteId)) {
        athleteMap.get(athleteId).personal_bests.push({
          exercise: pb.exercise_name,
          weight_kg: pb.weight_kg,
          reps: pb.reps,
          date: pb.date,
        });
      }
    }
  }

  const output = {
    exported_at: new Date().toISOString(),
    date_range: {
      from: opts.dateFrom ?? "all time",
      to: opts.dateTo ?? "present",
    },
    athletes: Array.from(athleteMap.values()),
  };

  return JSON.stringify(output, null, 2);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let opts: ExportOptions;
  try {
    opts = await req.json();
    if (!opts.format || !opts.fields || !opts.athleteId) throw new Error();
  } catch {
    return NextResponse.json({ error: "Invalid export options" }, { status: 400 });
  }

  let data: any;
  try {
    data = await fetchExportData(opts);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not fetch data" },
      { status: 500 }
    );
  }

  const date = new Date().toISOString().slice(0, 10);
  const scope = opts.athleteId === "all" ? "all-athletes" : "athlete";

  if (opts.format === "json") {
    const json = buildJSON(data, opts);
    return new NextResponse(json, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="athletiq-export-${scope}-${date}.json"`,
      },
    });
  }

  const csv = buildCSV(data, opts);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="athletiq-export-${scope}-${date}.csv"`,
    },
  });
}

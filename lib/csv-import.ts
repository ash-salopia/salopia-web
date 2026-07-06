import Papa from "papaparse";
import { createClient } from "@/lib/supabase-browser";
import { findLibraryEntryByName } from "@/lib/data/library";
import { todayISO, datesInRange, parseRepeatDays } from "@/lib/date-utils";
import { pickCsvField as pick } from "@/lib/csv-utils";
import type { NewExerciseInput } from "@/lib/data/sessions";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface CsvImportResult {
  sessionsCreated: number;
  exercisesImported: number;
  matchedToLibrary: number;
}

export async function importCsv(file: File, athleteId: string): Promise<CsvImportResult> {
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length) {
    throw new Error("Could not read that CSV — check it's a valid, comma-separated file.");
  }

  let matchedCount = 0;
  let csvDate = "";
  let csvName = "";
  let csvRepeatDays = "";
  let csvRepeatUntil = "";

  const rows: NewExerciseInput[] = [];

  for (const r of parsed.data) {
    const name = pick(r, ["exercise", "movement", "name"]).trim();
    if (!name) continue;

    const sets = parseInt(pick(r, ["sets", "set"])) || 3;
    const reps = pick(r, ["reps", "rep"]).trim();
    const time = pick(r, ["time", "duration", "hold"]).trim();
    const rest = pick(r, ["rest", "recovery"]).trim();
    const targetLoad = pick(r, ["load", "weight"]).trim();
    const notes = pick(r, ["notes", "note", "cue"]).trim();

    const rowDate = pick(r, ["date", "session date"]).trim();
    const rowSessName = pick(r, ["session", "session name"]).trim();
    const rowRepeatDays = pick(r, ["repeat days", "repeatdays", "days"]).trim();
    const rowRepeatUntil = pick(r, ["repeat until", "repeatuntil", "until"]).trim();
    if (rowDate && !csvDate) csvDate = rowDate;
    if (rowSessName && !csvName) csvName = rowSessName;
    if (rowRepeatDays && !csvRepeatDays) csvRepeatDays = rowRepeatDays;
    if (rowRepeatUntil && !csvRepeatUntil) csvRepeatUntil = rowRepeatUntil;

    // Look up this exercise name in the saved library so CSV imports
    // link up to existing video/defaults the same way manually-typed +
    // autocompleted exercises do.
    const libMatch = await findLibraryEntryByName(name);
    if (libMatch) matchedCount++;

    const base: NewExerciseInput = {
      name,
      order: pick(r, ["order", "tag", "#"]).trim(),
      sets,
      reps: time ? "" : reps || "",
      time,
      rest,
      target_load: targetLoad,
      notes,
    };
    if (libMatch) {
      base.video_url = libMatch.video_url || "";
      // Explicit CSV values always win over library defaults — only
      // fill in from the library if the CSV left the field blank.
      if (!rest && libMatch.rest) base.rest = libMatch.rest;
      if (!targetLoad && libMatch.target_load) base.target_load = libMatch.target_load;
      if (!notes && libMatch.notes) base.notes = libMatch.notes;
      if (libMatch.tempo) base.tempo = libMatch.tempo;
    }
    rows.push(base);
  }

  if (!rows.length) throw new Error("No exercises found in that file.");

  const validDate = DATE_RE.test(csvDate) ? csvDate : null;
  const validUntil = DATE_RE.test(csvRepeatUntil) ? csvRepeatUntil : null;
  const repeatDayNums = csvRepeatDays ? parseRepeatDays(csvRepeatDays) : [];

  const supabase = createClient();

  if (repeatDayNums.length && validUntil) {
    // Repeat mode: one session per matching weekday from (validDate ||
    // today) through validUntil, capped at 90 dates for safety.
    const start = validDate ?? todayISO();
    const range = datesInRange(start, validUntil);
    if (!range.length) {
      throw new Error("Repeat Until must be on or after the start date.");
    }
    const sessionDates = range.filter((d) => {
      const [y, m, day] = d.split("-").map(Number);
      const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
      return repeatDayNums.includes(dow);
    });
    if (!sessionDates.length) {
      throw new Error("No dates matched those repeat days.");
    }
    if (sessionDates.length > 90) {
      throw new Error(`Too many sessions (${sessionDates.length}) — narrow Repeat Until.`);
    }

    // Insert all sessions, then all their exercises, in two batched calls
    // rather than one round-trip per session.
    const sessionRows = sessionDates.map((d) => ({
      athlete_id: athleteId,
      name: csvName || "Session",
      date: d,
      type: "strength" as const,
    }));
    const { data: createdSessions, error: sessErr } = await supabase
      .from("sessions")
      .insert(sessionRows)
      .select();
    if (sessErr) throw sessErr;

    const exerciseRows = createdSessions.flatMap((sess) =>
      rows.map((e, i) => ({
        session_id: sess.id,
        name: e.name,
        order: e.order ?? "",
        sets: e.sets ?? 3,
        reps: e.reps ?? "",
        time: e.time ?? "",
        rest: e.rest ?? "",
        target_load: e.target_load ?? "",
        tempo: e.tempo ?? "2-0-2",
        each_side: e.each_side ?? false,
        notes: e.notes ?? "",
        video_url: e.video_url ?? "",
        sort_order: i,
        log: Array.from({ length: e.sets ?? 3 }, () => ({ weight: "", done: false, reps: "" })),
      }))
    );
    const { error: exErr } = await supabase.from("session_exercises").insert(exerciseRows);
    if (exErr) throw exErr;

    return {
      sessionsCreated: createdSessions.length,
      exercisesImported: rows.length,
      matchedToLibrary: matchedCount,
    };
  }

  // Single-session mode
  const { data: session, error: sessErr } = await supabase
    .from("sessions")
    .insert({
      athlete_id: athleteId,
      name: csvName || "Session",
      date: validDate ?? todayISO(),
      type: "strength" as const,
    })
    .select()
    .single();
  if (sessErr) throw sessErr;

  const exerciseRows = rows.map((e, i) => ({
    session_id: session.id,
    name: e.name,
    order: e.order ?? "",
    sets: e.sets ?? 3,
    reps: e.reps ?? "",
    time: e.time ?? "",
    rest: e.rest ?? "",
    target_load: e.target_load ?? "",
    tempo: e.tempo ?? "2-0-2",
    each_side: e.each_side ?? false,
    notes: e.notes ?? "",
    video_url: e.video_url ?? "",
    sort_order: i,
    log: Array.from({ length: e.sets ?? 3 }, () => ({ weight: "", done: false, reps: "" })),
  }));
  const { error: exErr } = await supabase.from("session_exercises").insert(exerciseRows);
  if (exErr) throw exErr;

  return {
    sessionsCreated: 1,
    exercisesImported: rows.length,
    matchedToLibrary: matchedCount,
  };
}

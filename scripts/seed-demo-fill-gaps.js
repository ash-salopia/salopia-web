// Non-destructive top-up: extends every "standard" demo athlete's
// strength session history so their calendar has continuous coverage
// with no stale tail, through END_DATE (end of December 2026) - requested
// live: "update all other athletes' programmes to include sessions in
// October & November with no gaps in history for any new prospective
// coaches looking at trialling the app."
//
// Covers the 7 base athletes (Ava Thompson, Ethan Wright, Grace
// Mitchell, Jake Morrison, Liam O'Connor, Noah Patel, Sophie Bennett),
// Marcus Webb (VBT), and Ryan Foster (had zero sessions at all).
// Deliberately does NOT touch Marcus Vale (MAS) or Rico Alvarez (RTP)
// — those each have their own dedicated, already-idempotent seed
// script (seed-mas-hr-zones-demo.js / seed-training-load-rtp-demo.js)
// that regenerates relative to "today" when re-run — just re-run those
// directly instead. "Test" is left alone too (not a prospect-facing
// athlete, looks like Ash's own scratch account).
//
// Twice-weekly strength sessions (same SESSION_A/SESSION_B exercise
// pattern seed-demo-org.js originally seeded these athletes with),
// continuing each athlete's actual last logged weight per exercise
// (queried fresh, not a hardcoded assumption) with a slow realistic
// ~0.6%/session progression — so there's no visible jump where the
// top-up begins. Only ever INSERTS, never deletes/updates anything
// existing, and only on a date that doesn't already exist for that
// athlete — safe to re-run.
//
// Usage: node scripts/seed-demo-fill-gaps.js
//        DRY_RUN=1 node scripts/seed-demo-fill-gaps.js   (logs only, no writes)

const fs = require("fs");
const path = require("path");

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

const { createClient } = require("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const DEMO_ORG_NAME = "VIS BUILD Demo";
const END_DATE = "2026-12-31";
// An existing gap longer than this (days) between two sessions gets
// filled too, not just the tail after the last session.
const MAX_GAP_DAYS = 7;
const DRY_RUN = process.env.DRY_RUN === "1";

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}
function addDaysISO(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── Mirrors seed-demo-org.js's SESSION_A/SESSION_B exactly, so a
// continued history doesn't suddenly look like a different programme. ──
const SESSION_A_EXERCISES = [
  { name: "Barbell Back Squat", baseRange: [55, 90], sets: 4, reps: 5, rest: "2min" },
  { name: "Romanian Deadlift", baseRange: [45, 75], sets: 3, reps: 8, rest: "90s" },
  { name: "Barbell Bench Press", baseRange: [40, 65], sets: 3, reps: 6, rest: "90s" },
  { name: "Bent Over Row", baseRange: [35, 55], sets: 3, reps: 8, rest: "90s" },
];
const SESSION_B_EXERCISES = [
  { name: "Bulgarian Split Squat", baseRange: [14, 26], sets: 3, reps: 8, rest: "90s", eachSide: true },
  { name: "Hip Thrust", baseRange: [50, 85], sets: 4, reps: 8, rest: "2min" },
  { name: "Barbell Overhead Press", baseRange: [25, 45], sets: 3, reps: 6, rest: "90s" },
  { name: "Incline Dumbbell Press", baseRange: [16, 28], sets: 3, reps: 8, rest: "90s", eachSide: true },
];
const BODYWEIGHT_A = { name: "Chin Up", sets: 3, reps: 8 };
const BODYWEIGHT_B = { name: "Hanging Leg Raise", sets: 3, reps: 10 };
const TIME_EXERCISE = { name: "Side Plank", sets: 2, time: 45 };

function roundToPlate(w) {
  return Math.round(w / 1.25) * 1.25;
}

const ATHLETES = [
  "Ava Thompson", "Ethan Wright", "Grace Mitchell", "Jake Morrison",
  "Liam O'Connor", "Noah Patel", "Sophie Bennett", "Marcus Webb (VBT)",
  "Ryan Foster",
];

function exercisePresc(sessionId, sortOrder, over) {
  return {
    session_id: sessionId,
    name: over.name,
    order: String(sortOrder + 1),
    sets: over.sets ?? 3,
    reps: over.reps ?? "8",
    time: over.time ?? "",
    rest: over.rest ?? "90s",
    target_load: "",
    tempo: "2-0-2",
    each_side: over.each_side ?? false,
    notes: "",
    video_url: "",
    session_notes: "",
    progress: "",
    progress_reminder: false,
    sort_order: sortOrder,
    is_bodyweight: over.is_bodyweight ?? false,
    percent_1rm: null,
    use_percent_1rm: false,
    set_percents: [],
    athlete_exercise_notes: "",
    log: over.log,
  };
}

async function fillAthlete(athlete) {
  const today = todayISO();
  const { data: existingSessions } = await sb
    .from("sessions").select("id, date").eq("athlete_id", athlete.id).order("date", { ascending: true });
  const existingDates = new Set((existingSessions ?? []).map((s) => s.date));
  const pastSessionIds = (existingSessions ?? []).filter((s) => s.date < today).map((s) => s.id);
  const sessionDateById = new Map((existingSessions ?? []).map((s) => [s.id, s.date]));
  const maxDate = existingSessions?.length ? existingSessions[existingSessions.length - 1].date : null;

  // Every logged (date, heaviest weight) per exercise across this
  // athlete's past sessions, so each filled window continues from the
  // weight they were actually lifting just before it.
  const history = new Map();
  for (const def of [...SESSION_A_EXERCISES, ...SESSION_B_EXERCISES]) {
    const points = [];
    if (pastSessionIds.length) {
      const { data: rows } = await sb
        .from("session_exercises").select("session_id, log").eq("name", def.name).in("session_id", pastSessionIds);
      for (const row of rows ?? []) {
        const weights = (row.log ?? []).map((s) => parseFloat(s.weight)).filter((w) => !isNaN(w) && w > 0);
        if (weights.length) points.push({ date: sessionDateById.get(row.session_id), weight: Math.max(...weights) });
      }
    }
    history.set(def.name, points);
  }
  // Heaviest logged weight from the most recent session on/before
  // `date`, else the midpoint of the exercise's normal starting range
  // (a brand-new athlete like Ryan Foster has nothing logged yet).
  function weightAsOf(def, date) {
    let best = { date: "", weight: 0 };
    for (const p of history.get(def.name)) {
      if (p.date <= date && p.date > best.date) best = p;
    }
    const [lo, hi] = def.baseRange;
    return best.weight > 0 ? best.weight : roundToPlate((lo + hi) / 2);
  }

  // Windows to fill: every gap > MAX_GAP_DAYS between existing
  // sessions, plus the tail from the last session (or 14 weeks before
  // today, for an athlete with none at all - matching the depth the
  // other base athletes originally got) through END_DATE. A filled gap
  // stops 2 days short of the session that closes it so nothing lands
  // back-to-back with existing work.
  const dates = [...existingDates].sort();
  const windows = [];
  for (let i = 1; i < dates.length; i++) {
    const days = (new Date(dates[i]) - new Date(dates[i - 1])) / 864e5;
    if (days > MAX_GAP_DAYS) windows.push({ from: dates[i - 1], until: addDaysISO(dates[i], -2) });
  }
  windows.push({ from: maxDate ?? addDaysISO(today, -14 * 7), until: END_DATE });

  let inserted = 0;
  const insertedDates = [];

  for (const win of windows) {
    // Alternating 3/4-day cadence - the same "twice a week" rhythm the
    // base seed uses, just not pinned to its exact original weekdays.
    let cursor = win.from;
    let isA = true;
    let gapDays = 3;
    const weightState = new Map(
      [...SESSION_A_EXERCISES, ...SESSION_B_EXERCISES].map((def) => [def.name, weightAsOf(def, win.from)])
    );

    while (true) {
      cursor = addDaysISO(cursor, gapDays);
      gapDays = gapDays === 3 ? 4 : 3;
      if (cursor > win.until || cursor > END_DATE) break;
      if (existingDates.has(cursor)) { isA = !isA; continue; }

      const isPast = cursor < today;
      const weightedDefs = isA ? SESSION_A_EXERCISES : SESSION_B_EXERCISES;
      const bodyweightDef = isA ? BODYWEIGHT_A : BODYWEIGHT_B;

      const exercises = weightedDefs.map((def) => {
        if (isPast) weightState.set(def.name, weightState.get(def.name) * 1.006);
        const displayWeight = Math.max(roundToPlate(weightState.get(def.name)), 5);
        return {
          name: def.name, sets: def.sets, reps: String(def.reps), rest: def.rest, each_side: !!def.eachSide,
          log: isPast
            ? Array.from({ length: def.sets }, () => ({ weight: String(displayWeight), reps: String(def.reps), time: "", done: true }))
            : Array.from({ length: def.sets }, () => ({ weight: "", reps: "", time: "", done: false })),
        };
      });

      exercises.push({
        name: bodyweightDef.name, sets: bodyweightDef.sets, reps: String(bodyweightDef.reps), rest: "90s", is_bodyweight: true,
        log: isPast
          ? Array.from({ length: bodyweightDef.sets }, (_, i) => ({ weight: "", reps: String(bodyweightDef.reps + (i % 2)), time: "", done: true }))
          : Array.from({ length: bodyweightDef.sets }, () => ({ weight: "", reps: "", time: "", done: false })),
      });

      if (isA) {
        exercises.push({
          name: TIME_EXERCISE.name, sets: TIME_EXERCISE.sets, reps: "", time: String(TIME_EXERCISE.time), rest: "60s", is_bodyweight: true,
          log: isPast
            ? Array.from({ length: TIME_EXERCISE.sets }, () => ({ weight: "", reps: "", time: String(TIME_EXERCISE.time), done: true }))
            : Array.from({ length: TIME_EXERCISE.sets }, () => ({ weight: "", reps: "", time: "", done: false })),
        });
      }

      if (!DRY_RUN) {
        const { data: session, error: sessErr } = await sb
          .from("sessions")
          .insert({ athlete_id: athlete.id, name: isA ? "Lower A" : "Upper B", date: cursor, type: "strength" })
          .select("id").single();
        if (sessErr) throw sessErr;
        const exRows = exercises.map((e, i) => exercisePresc(session.id, i, e));
        const { error: exErr } = await sb.from("session_exercises").insert(exRows);
        if (exErr) throw exErr;
      }

      existingDates.add(cursor);
      inserted++;
      insertedDates.push(cursor);
      isA = !isA;
    }
  }

  insertedDates.sort();
  return { inserted, first: insertedDates[0], last: insertedDates[insertedDates.length - 1] };
}

async function main() {
  const { data: org, error: orgErr } = await sb
    .from("organisations").select("id").eq("name", DEMO_ORG_NAME).single();
  if (orgErr || !org) { console.error(`No "${DEMO_ORG_NAME}" org found.`); process.exit(1); }

  if (DRY_RUN) console.log("DRY RUN — no writes will happen.\n");

  for (const name of ATHLETES) {
    const { data: athlete, error } = await sb
      .from("athletes").select("id, name").eq("organisation_id", org.id).eq("name", name).maybeSingle();
    if (error || !athlete) { console.warn(`⚠ "${name}" not found in demo org — skipped.`); continue; }
    const r = await fillAthlete(athlete);
    console.log(`${name}: +${r.inserted} sessions${r.inserted ? ` (${r.first} → ${r.last})` : ""}`);
  }
}

main().catch((e) => { console.error("FILL FAILED:", e.message); process.exit(1); });

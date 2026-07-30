// Creates (or resets) a fully populated demo organisation a
// prospective coach can explore via /demo — a fixed login link that
// signs anyone straight into this org, no signup needed.
//
// Safe to re-run any time the demo data gets messy: it wipes the
// existing demo org (if one exists) and rebuilds it from scratch.
// Never touches any other organisation except to CLONE (read-only)
// the real org's testing setup (test_metrics/test_batteries/
// test_benchmarks) — see CLONE_SOURCE_ORG_NAME below — since that's
// the platform's genuine differentiator and worth showing off with
// real, correct norms rather than invented placeholder numbers.
//
// Usage: node scripts/seed-demo-org.js
// Requires DEMO_COACH_EMAIL and DEMO_COACH_PASSWORD in .env.local
// (same credentials app/demo/route.ts uses to sign visitors in).

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

const DEMO_ORG_NAME = "AthletiQ Demo";
const CLONE_SOURCE_ORG_NAME = "Salopia Health & Performance";

const DEMO_COACH_EMAIL = env.DEMO_COACH_EMAIL;
const DEMO_COACH_PASSWORD = env.DEMO_COACH_PASSWORD;

if (!DEMO_COACH_EMAIL || !DEMO_COACH_PASSWORD) {
  console.error("Missing DEMO_COACH_EMAIL / DEMO_COACH_PASSWORD in .env.local — add both before running this script.");
  process.exit(1);
}

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}
function addDaysISO(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function stripRow(row, extraOmit = []) {
  const { id, organisation_id, created_at, ...rest } = row;
  for (const k of extraOmit) delete rest[k];
  return rest;
}

// ── 1. Wipe any existing demo org ──────────────────────────────────────────────

async function resetExistingDemoOrg() {
  const { data: org } = await sb.from("organisations").select("id").eq("name", DEMO_ORG_NAME).maybeSingle();
  if (!org) { console.log("No existing demo org to remove."); return; }
  console.log("Removing existing demo org", org.id, "...");

  const { data: athletes } = await sb.from("athletes").select("id").eq("organisation_id", org.id);
  const athleteIds = (athletes ?? []).map((a) => a.id);
  if (athleteIds.length) {
    const { data: sessions } = await sb.from("sessions").select("id").in("athlete_id", athleteIds);
    const sessionIds = (sessions ?? []).map((s) => s.id);
    if (sessionIds.length) {
      await sb.from("session_exercises").delete().in("session_id", sessionIds);
      await sb.from("sessions").delete().in("id", sessionIds);
    }
    await sb.from("personal_bests").delete().in("athlete_id", athleteIds);
    await sb.from("athlete_one_rms").delete().in("athlete_id", athleteIds);
    const { data: testSessions } = await sb.from("test_sessions").select("id").in("athlete_id", athleteIds);
    const testSessionIds = (testSessions ?? []).map((t) => t.id);
    if (testSessionIds.length) {
      await sb.from("test_results").delete().in("test_session_id", testSessionIds);
      await sb.from("test_sessions").delete().in("id", testSessionIds);
    }
    await sb.from("reports").delete().in("athlete_id", athleteIds);
    await sb.from("programme_assignments").delete().in("athlete_id", athleteIds);
    await sb.from("athletes").delete().in("id", athleteIds);
  }

  const { data: batteries } = await sb.from("test_batteries").select("id").eq("organisation_id", org.id);
  const { data: metrics } = await sb.from("test_metrics").select("id").eq("organisation_id", org.id);
  const metricIds = (metrics ?? []).map((m) => m.id);
  if (metricIds.length) await sb.from("test_benchmarks").delete().in("test_metric_id", metricIds);
  if (batteries?.length) await sb.from("test_battery_metrics").delete().in("test_battery_id", batteries.map((b) => b.id));
  await sb.from("test_batteries").delete().eq("organisation_id", org.id);
  await sb.from("test_metrics").delete().eq("organisation_id", org.id);

  const { data: templates } = await sb.from("templates").select("id").eq("organisation_id", org.id);
  if (templates?.length) await sb.from("template_defs").delete().in("template_id", templates.map((t) => t.id));
  await sb.from("templates").delete().eq("organisation_id", org.id);

  const { data: programmes } = await sb.from("programmes").select("id").eq("organisation_id", org.id);
  if (programmes?.length) await sb.from("programme_sessions").delete().in("programme_id", programmes.map((p) => p.id));
  await sb.from("programmes").delete().eq("organisation_id", org.id);

  await sb.from("library_entries").delete().eq("organisation_id", org.id);
  await sb.from("announcements").delete().eq("organisation_id", org.id);

  const { data: coaches } = await sb.from("coaches").select("id").eq("organisation_id", org.id);
  for (const c of coaches ?? []) {
    try { await sb.auth.admin.deleteUser(c.id); } catch (e) { /* already gone */ }
  }
  await sb.from("coaches").delete().eq("organisation_id", org.id);
  await sb.from("organisations").delete().eq("id", org.id);
  console.log("Existing demo org removed.");
}

// ── 2. Create the demo org + coach ─────────────────────────────────────────────

async function createDemoOrgAndCoach() {
  const { data: org, error: orgErr } = await sb
    .from("organisations")
    .insert({
      name: DEMO_ORG_NAME,
      plan: "trial",
      settings: {
        one_rm_formula: "lander",
        one_rm_source: "rolling",
        weight_unit: "kg",
        checkin_enabled: true,
        reflection_enabled: true,
        hyrox_enabled: true,
        report_frequency_weeks: 4,
      },
    })
    .select()
    .single();
  if (orgErr) throw orgErr;

  const { data: authUser, error: createErr } = await sb.auth.admin.createUser({
    email: DEMO_COACH_EMAIL,
    password: DEMO_COACH_PASSWORD,
    email_confirm: true,
  });
  if (createErr) throw createErr;

  const { error: coachErr } = await sb.from("coaches").insert({
    id: authUser.user.id,
    organisation_id: org.id,
    name: "Alex Carter",
    role: "owner",
  });
  if (coachErr) throw coachErr;

  console.log("Created demo org", org.id, "and coach", authUser.user.id);
  return { org, coachId: authUser.user.id };
}

// ── 3. Clone the real org's testing setup (metrics/batteries/benchmarks) ──────

async function cloneTestingSetup(demoOrgId) {
  const { data: sourceOrg } = await sb.from("organisations").select("id").eq("name", CLONE_SOURCE_ORG_NAME).maybeSingle();
  if (!sourceOrg) {
    console.log(`Source org "${CLONE_SOURCE_ORG_NAME}" not found — skipping testing setup clone.`);
    return { batteryId: null, metricIdByName: new Map() };
  }

  const { data: sourceMetrics } = await sb.from("test_metrics").select("*").eq("organisation_id", sourceOrg.id);
  const metricIdMap = new Map(); // old id -> new id
  const metricIdByName = new Map(); // name -> new id
  for (const m of sourceMetrics ?? []) {
    const { data: newMetric, error } = await sb
      .from("test_metrics")
      .insert({ ...stripRow(m), organisation_id: demoOrgId })
      .select()
      .single();
    if (error) throw error;
    metricIdMap.set(m.id, newMetric.id);
    metricIdByName.set(newMetric.name, newMetric.id);
  }
  console.log(`Cloned ${metricIdMap.size} test metrics.`);

  const { data: sourceBenchmarks } = await sb
    .from("test_benchmarks")
    .select("*")
    .in("test_metric_id", [...metricIdMap.keys()]);
  if (sourceBenchmarks?.length) {
    const newBenchmarks = sourceBenchmarks.map((b) => ({
      ...stripRow(b),
      test_metric_id: metricIdMap.get(b.test_metric_id),
    }));
    const { error } = await sb.from("test_benchmarks").insert(newBenchmarks);
    if (error) throw error;
    console.log(`Cloned ${newBenchmarks.length} benchmarks.`);
  }

  const { data: sourceBatteries } = await sb.from("test_batteries").select("*").eq("organisation_id", sourceOrg.id);
  let firstNewBatteryId = null;
  for (const battery of sourceBatteries ?? []) {
    const { data: newBattery, error } = await sb
      .from("test_batteries")
      .insert({ ...stripRow(battery), organisation_id: demoOrgId })
      .select()
      .single();
    if (error) throw error;
    if (!firstNewBatteryId) firstNewBatteryId = newBattery.id;

    const { data: bm } = await sb.from("test_battery_metrics").select("*").eq("test_battery_id", battery.id);
    if (bm?.length) {
      const rows = bm.map((r) => ({
        test_battery_id: newBattery.id,
        test_metric_id: metricIdMap.get(r.test_metric_id),
        sort_order: r.sort_order,
      })).filter((r) => r.test_metric_id);
      if (rows.length) await sb.from("test_battery_metrics").insert(rows);
    }
  }
  console.log(`Cloned ${sourceBatteries?.length ?? 0} test batteries.`);

  return { batteryId: firstNewBatteryId, metricIdByName };
}

// ── 4. Exercise library ────────────────────────────────────────────────────────

const LIBRARY_EXERCISES = [
  { name: "Barbell Back Squat", types: ["strength", "lower"] },
  { name: "Barbell Front Squat", types: ["strength", "lower"] },
  { name: "Romanian Deadlift", types: ["strength", "lower"] },
  { name: "Conventional Deadlift", types: ["strength", "lower"] },
  { name: "Barbell Bench Press", types: ["strength", "upper"] },
  { name: "Incline Dumbbell Press", types: ["strength", "upper"] },
  { name: "Barbell Overhead Press", types: ["strength", "upper"] },
  { name: "Weighted Pull Up", types: ["strength", "upper"] },
  { name: "Chin Up", types: ["strength", "upper", "bodyweight"] },
  { name: "Bent Over Row", types: ["strength", "upper"] },
  { name: "Bulgarian Split Squat", types: ["strength", "lower"] },
  { name: "Walking Lunge", types: ["strength", "lower"] },
  { name: "Hip Thrust", types: ["strength", "lower"] },
  { name: "Side Plank", types: ["strength", "core", "bodyweight"] },
  { name: "Hanging Leg Raise", types: ["strength", "core", "bodyweight"] },
  { name: "Med Ball Rotational Throw", types: ["power_speed"] },
  { name: "Broad Jump", types: ["power_speed"] },
  { name: "Box Jump", types: ["power_speed"] },
  { name: "10m Sprint", types: ["power_speed"] },
  { name: "Farmers Carry", types: ["strength", "core"] },
];

async function seedLibrary(demoOrgId) {
  const rows = LIBRARY_EXERCISES.map((e) => ({
    organisation_id: demoOrgId,
    name: e.name,
    types: e.types,
    video_url: "",
    sets: "3",
    reps: "8",
    time: "",
    rest: "90s",
    target_load: "",
    tempo: "2-0-2",
    notes: "",
  }));
  const { data, error } = await sb.from("library_entries").insert(rows).select();
  if (error) throw error;
  console.log(`Seeded ${data.length} library exercises.`);
  return data;
}

// ── 5. Athletes ─────────────────────────────────────────────────────────────

const ATHLETES = [
  { name: "Jake Morrison", group: "Senior Squad", sex: "male", dob: "2006-03-14", bodyweight_kg: 82, in_live_group: true },
  { name: "Sophie Bennett", group: "Senior Squad", sex: "female", dob: "2005-11-02", bodyweight_kg: 64, in_live_group: true },
  { name: "Liam O'Connor", group: "U18", sex: "male", dob: "2009-06-21", bodyweight_kg: 71, in_live_group: false },
  { name: "Ava Thompson", group: "U18", sex: "female", dob: "2009-01-30", bodyweight_kg: 58, in_live_group: true },
  { name: "Ethan Wright", group: "U16", sex: "male", dob: "2011-09-08", bodyweight_kg: 60, in_live_group: false },
  { name: "Grace Mitchell", group: "Senior Squad", sex: "female", dob: "2004-05-17", bodyweight_kg: 66, in_live_group: false },
  { name: "Noah Patel", group: "U18", sex: "male", dob: "2008-12-11", bodyweight_kg: 74, in_live_group: false },
];
const ARCHIVED_ATHLETE = { name: "Ryan Foster", group: "Senior Squad", sex: "male", dob: "2003-08-04", bodyweight_kg: 88 };

async function seedAthletes(demoOrgId) {
  const rows = ATHLETES.map((a) => ({
    organisation_id: demoOrgId,
    name: a.name,
    group: a.group,
    sex: a.sex,
    date_of_birth: a.dob,
    bodyweight_kg: a.bodyweight_kg,
    in_live_group: a.in_live_group,
  }));
  const { data, error } = await sb.from("athletes").insert(rows).select();
  if (error) throw error;

  const { data: archived, error: archErr } = await sb
    .from("athletes")
    .insert({
      organisation_id: demoOrgId, name: ARCHIVED_ATHLETE.name, group: ARCHIVED_ATHLETE.group,
      sex: ARCHIVED_ATHLETE.sex, date_of_birth: ARCHIVED_ATHLETE.dob, bodyweight_kg: ARCHIVED_ATHLETE.bodyweight_kg,
      archived: true,
    })
    .select()
    .single();
  if (archErr) throw archErr;

  console.log(`Seeded ${data.length} active athletes + 1 archived.`);
  return { athletes: data, archivedAthlete: archived };
}

// ── 6. Sessions, logged sets, and PBs ─────────────────────────────────────────

function defaultExerciseRow(sessionId, sortOrder, over) {
  const sets = over.sets ?? 3;
  return {
    session_id: sessionId,
    name: over.name,
    order: String(sortOrder + 1),
    sets,
    reps: over.reps ?? "8",
    time: over.time ?? "",
    rest: over.rest ?? "90s",
    target_load: over.target_load ?? "",
    tempo: "2-0-2",
    each_side: over.each_side ?? false,
    notes: over.notes ?? "",
    video_url: "",
    session_notes: "",
    progress: "",
    progress_reminder: false,
    sort_order: sortOrder,
    is_bodyweight: over.is_bodyweight ?? false,
    percent_1rm: null,
    use_percent_1rm: over.use_percent_1rm ?? false,
    set_percents: over.set_percents ?? [],
    athlete_exercise_notes: "",
    log: over.log,
  };
}

// Four growth patterns applied per athlete-per-exercise (rotated
// deterministically below, not randomly, so re-seeding produces the
// same shape of data) — this is what gives the Training Load
// Report's Highlights section something real to differentiate:
// "strong"/"steady" exercises land in Top Progressed, "plateau"/
// "declining" ones land in Worth a Review, rather than every
// exercise trending identically upward.
const ARCHETYPES = [
  { key: "strong", factor: 1.025 },
  { key: "steady", factor: 1.012 },
  { key: "plateau", factor: 1.002 },
  { key: "declining", factor: 0.996 },
];

// Weighted exercises split across two alternating session types, each
// with a realistic starting-weight range and rep scheme. eachSide
// exercises (dumbbell/unilateral) exercise the report's per-hand
// tonnage-doubling logic and its "(logged per hand...)" tag.
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

// Recurring note themes seeded onto a couple of athletes so the
// report's Athlete Notes section and the AI's recurring-themes read
// have real (and, for other athletes, deliberately absent) signal to
// work with — not every athlete has notes, so the "no clear theme"
// fallback path gets exercised too.
const NOTE_PLANS = {
  "Jake Morrison": {
    sessionNotes: ["Felt flat again this session, sleep's been poor this week.", "Better session, slept properly for once."],
    exerciseNotes: [
      { exercise: "Barbell Bench Press", note: "Left shoulder felt tight during bench again today, same as last few weeks." },
      { exercise: "Barbell Bench Press", note: "Shoulder still a bit tight on bench but not getting worse." },
    ],
  },
  "Sophie Bennett": {
    sessionNotes: ["Really good energy this week, everything felt light.", "Great session again, feeling strong."],
    exerciseNotes: [{ exercise: "Romanian Deadlift", note: "Lower back felt a little tight setting up on RDLs." }],
  },
};

async function seedSessionsAndPBs(athletes) {
  const today = todayISO();
  const pbRows = [];
  const plan = [];

  athletes.forEach((athlete, athleteIdx) => {
    const archetypeFor = (exIdx) => ARCHETYPES[(athleteIdx + exIdx) % ARCHETYPES.length];

    // Per-athlete, per-exercise starting weight + growth factor, fixed
    // for the whole history so week-to-week progression compounds
    // consistently rather than jumping around randomly.
    // `raw` is the true compounding float, never itself rounded —
    // rounding it and feeding the rounded value back in each session
    // creates a fixed point for slow growth factors (plateau's
    // ~0.2%/session gain is smaller than half a 1.25kg increment, so
    // round-then-reassign never accumulates and every session prints
    // the same weight). Only `roundToPlate(raw)` at display time is
    // rounded; the underlying compounding stays precise.
    const exerciseState = new Map();
    [...SESSION_A_EXERCISES, ...SESSION_B_EXERCISES].forEach((ex, i) => {
      const [lo, hi] = ex.baseRange;
      const start = lo + Math.random() * (hi - lo);
      exerciseState.set(ex.name, { raw: start, factor: archetypeFor(i).factor });
    });

    // 8 weeks back through 1 week ahead, 2 sessions/week — so every
    // athlete has upcoming sessions on the calendar (not just logged
    // history) and enough depth for the report's 8/12-week presets
    // and weekly-average view to actually show a trend.
    for (let week = 8; week >= -1; week--) {
      for (const dayOffset of [1, 4]) {
        const date = addDaysISO(today, -(week * 7) - (7 - dayOffset));
        const isPast = date < today;
        const isSessionA = dayOffset === 1;
        const weightedDefs = isSessionA ? SESSION_A_EXERCISES : SESSION_B_EXERCISES;
        const bodyweightDef = isSessionA ? BODYWEIGHT_A : BODYWEIGHT_B;

        const exercises = weightedDefs.map((def) => {
          const state = exerciseState.get(def.name);
          if (isPast) state.raw *= state.factor;
          // Floor is a sanity minimum (never an unloaded bar), not
          // tied to the exercise's own starting range — clamping to
          // baseRange[0] would flatten "declining" exercises to 0%
          // the moment they dipped below their own starting point.
          const displayWeight = Math.max(roundToPlate(state.raw), 5);
          return {
            name: def.name, sets: def.sets, reps: String(def.reps), rest: def.rest,
            each_side: !!def.eachSide,
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

        if (isSessionA) {
          exercises.push({
            name: TIME_EXERCISE.name, sets: TIME_EXERCISE.sets, reps: "", time: String(TIME_EXERCISE.time), rest: "60s", is_bodyweight: true,
            log: isPast
              ? Array.from({ length: TIME_EXERCISE.sets }, () => ({ weight: "", reps: "", time: String(TIME_EXERCISE.time), done: true }))
              : Array.from({ length: TIME_EXERCISE.sets }, () => ({ weight: "", reps: "", time: "", done: false })),
          });
        }

        plan.push({
          athlete_id: athlete.id,
          athlete_name: athlete.name,
          type: "strength",
          date,
          name: isSessionA ? "Lower + Upper A" : "Lower + Upper B",
          exercises,
          isPast,
          isSessionA,
        });
      }
    }
  });

  // Insert sessions, then exercises (need session ids first). Applies
  // the note plans onto each athlete's most recent PAST sessions —
  // done inline so exercise ids (needed for athlete_exercise_notes)
  // are available right after insert.
  const pastCountByAthlete = new Map();
  for (const s of plan) if (s.isPast) pastCountByAthlete.set(s.athlete_id, (pastCountByAthlete.get(s.athlete_id) ?? 0) + 1);
  const seenSoFarByAthlete = new Map();

  for (const s of plan) {
    let athleteNotes = null;
    if (s.isPast) {
      seenSoFarByAthlete.set(s.athlete_id, (seenSoFarByAthlete.get(s.athlete_id) ?? 0) + 1);
      const seen = seenSoFarByAthlete.get(s.athlete_id);
      const totalPast = pastCountByAthlete.get(s.athlete_id);
      const fromEnd = totalPast - seen; // 0 = most recent past session
      const notePlan = NOTE_PLANS[s.athlete_name];
      if (notePlan && fromEnd < notePlan.sessionNotes.length) {
        athleteNotes = notePlan.sessionNotes[fromEnd];
      }
    }

    const { data: session, error } = await sb
      .from("sessions")
      .insert({ athlete_id: s.athlete_id, type: s.type, date: s.date, name: s.name, athlete_notes: athleteNotes })
      .select()
      .single();
    if (error) throw error;

    const exRows = s.exercises.map((e, i) => defaultExerciseRow(session.id, i, e));
    const { data: insertedEx, error: exErr } = await sb.from("session_exercises").insert(exRows).select();
    if (exErr) throw exErr;

    // Attach a couple of per-exercise notes to this athlete's most
    // recent matching-exercise sessions, same recency logic as above.
    if (s.isPast) {
      const notePlan = NOTE_PLANS[s.athlete_name];
      if (notePlan) {
        for (const en of notePlan.exerciseNotes) {
          const match = insertedEx.find((e) => e.name === en.exercise);
          if (match) {
            const seen = seenSoFarByAthlete.get(s.athlete_id);
            const totalPast = pastCountByAthlete.get(s.athlete_id);
            const fromEnd = totalPast - seen;
            if (fromEnd < 3) {
              await sb.from("session_exercises").update({ athlete_exercise_notes: en.note }).eq("id", match.id);
            }
          }
        }
      }

      // Generic PB detection across whatever exercises this session
      // has — weighted, bodyweight+reps, or bodyweight+time — rather
      // than hardcoding exercise names, so adding more exercises
      // above doesn't require touching this logic.
      for (const ex of s.exercises) {
        const done = ex.log.filter((l) => l.done);
        if (!done.length) continue;
        const isTimeMode = ex.name === TIME_EXERCISE.name;
        if (isTimeMode) {
          const maxTime = Math.max(...done.map((l) => Number(l.time) || 0), 0);
          if (maxTime > 0) pbRows.push({ athlete_id: s.athlete_id, exercise_name: ex.name, date: s.date, session_id: session.id, weight_kg: null, reps: null, time_seconds: maxTime });
        } else if (ex.is_bodyweight) {
          const maxReps = Math.max(...done.map((l) => Number(l.reps) || 0), 0);
          if (maxReps > 0) pbRows.push({ athlete_id: s.athlete_id, exercise_name: ex.name, date: s.date, session_id: session.id, weight_kg: null, reps: maxReps, time_seconds: null });
        } else {
          const maxWeight = Math.max(...done.map((l) => Number(l.weight) || 0), 0);
          if (maxWeight > 0) pbRows.push({ athlete_id: s.athlete_id, exercise_name: ex.name, date: s.date, session_id: session.id, weight_kg: maxWeight, reps: Number(done[0].reps) || null, time_seconds: null });
        }
      }
    }
  }

  console.log(`Seeded ${plan.length} sessions across ${athletes.length} athletes.`);

  // Keep only the single best PB per athlete+exercise (personal_bests
  // has a unique constraint on athlete_id/exercise_name/session_id,
  // and the UI shows the best across all — dedupe to the best row per
  // exercise so the feed reads like a real history, not one row per
  // session).
  const bestByKey = new Map();
  for (const pb of pbRows) {
    const key = `${pb.athlete_id}:${pb.exercise_name}`;
    const value = pb.weight_kg ?? pb.time_seconds ?? pb.reps ?? 0;
    const existing = bestByKey.get(key);
    const existingValue = existing ? (existing.weight_kg ?? existing.time_seconds ?? existing.reps ?? 0) : -1;
    if (!existing || value > existingValue) bestByKey.set(key, pb);
  }
  const dedupedPbs = [...bestByKey.values()];
  if (dedupedPbs.length) {
    const { error } = await sb.from("personal_bests").insert(dedupedPbs);
    if (error) throw error;
  }
  console.log(`Seeded ${dedupedPbs.length} personal bests.`);
}

// ── 7. %1RM showcase for one athlete ──────────────────────────────────────────

async function seedPercentOneRM(athletes) {
  const athlete = athletes[0];
  await sb.from("athlete_one_rms").insert({ athlete_id: athlete.id, exercise_name: "Barbell Back Squat", one_rm_kg: 120 });

  const today = todayISO();
  const { data: session, error } = await sb
    .from("sessions")
    .insert({ athlete_id: athlete.id, type: "strength", date: addDaysISO(today, 2), name: "Squat Ramp" })
    .select()
    .single();
  if (error) throw error;

  const exRow = defaultExerciseRow(session.id, 0, {
    name: "Barbell Back Squat", sets: 3, reps: "3", rest: "3min",
    use_percent_1rm: true, set_percents: ["75", "85", "92"],
    log: Array.from({ length: 3 }, () => ({ weight: "", reps: "", time: "", done: false })),
  });
  await sb.from("session_exercises").insert(exRow);
  console.log(`Seeded a %1RM ramp session for ${athlete.name}.`);
}

// ── 8. Testing session + results ──────────────────────────────────────────────

async function seedTesting(athletes, batteryId, metricIdByName) {
  if (!batteryId || !metricIdByName.size) { console.log("No cloned battery — skipping testing seed."); return; }

  const testAthletes = athletes.slice(0, 4);
  const today = todayISO();

  for (const athlete of testAthletes) {
    const { data: testSession, error } = await sb
      .from("test_sessions")
      .insert({ athlete_id: athlete.id, test_battery_id: batteryId, date: addDaysISO(today, -10), bodyweight_kg: athlete.bodyweight_kg, notes: "" })
      .select()
      .single();
    if (error) throw error;

    const resultRows = [];
    for (const [name, metricId] of metricIdByName) {
      const key = name.toLowerCase();
      let value;
      if (key.includes("sprint")) value = (1.6 + Math.random() * 0.4).toFixed(2);
      else if (key.includes("cmj") || key.includes("jump height")) value = (28 + Math.random() * 12).toFixed(1);
      else if (key.includes("imtp") || key.includes("force")) value = Math.round(1800 + Math.random() * 900);
      else if (key.includes("rsi")) value = (1.4 + Math.random() * 0.8).toFixed(2);
      else if (key.includes("plank") || key.includes("hold")) value = Math.round(45 + Math.random() * 60);
      else if (key.includes("5-0-5") || key.includes("agility")) value = (2.2 + Math.random() * 0.5).toFixed(2);
      else value = Math.round(10 + Math.random() * 40);
      resultRows.push({ test_session_id: testSession.id, test_metric_id: metricId, trial_number: 1, value });
    }
    if (resultRows.length) {
      const { error: resErr } = await sb.from("test_results").insert(resultRows);
      if (resErr) throw resErr;
    }
  }
  console.log(`Seeded testing sessions for ${testAthletes.length} athletes.`);
}

// ── 9. Template + programme ───────────────────────────────────────────────────

async function seedTemplateAndProgramme(demoOrgId, athletes) {
  const { data: template, error: tErr } = await sb.from("templates").insert({ organisation_id: demoOrgId, name: "4-Week Strength Block" }).select().single();
  if (tErr) throw tErr;

  const defs = [
    { name: "Lower A", type: "strength", days: [1, 4], exercises: [
      { name: "Barbell Back Squat", order: "1", sets: 4, reps: "5", rest: "2min", tempo: "2-0-2", each_side: false, notes: "", video_url: "", target_load: "" },
      { name: "Romanian Deadlift", order: "2", sets: 3, reps: "8", rest: "90s", tempo: "2-0-2", each_side: false, notes: "", video_url: "", target_load: "" },
    ] },
    { name: "Upper A", type: "strength", days: [2, 5], exercises: [
      { name: "Barbell Bench Press", order: "1", sets: 4, reps: "6", rest: "2min", tempo: "2-0-2", each_side: false, notes: "", video_url: "", target_load: "" },
      { name: "Bent Over Row", order: "2", sets: 3, reps: "8", rest: "90s", tempo: "2-0-2", each_side: false, notes: "", video_url: "", target_load: "" },
    ] },
  ];
  for (const def of defs) {
    const { error } = await sb.from("template_defs").insert({
      template_id: template.id, name: def.name, type: def.type, days: def.days, exercises: def.exercises,
    });
    if (error) throw error;
  }
  console.log("Seeded 1 template with 2 session defs.");

  const { data: programme, error: pErr } = await sb.from("programmes").insert({ organisation_id: demoOrgId, name: "Pre-Season Build", description: "4-week strength foundation block" }).select().single();
  if (pErr) throw pErr;

  const progSessions = defs.map((def, i) => ({
    programme_id: programme.id, name: def.name, type: def.type, sort_order: i,
    exercises: def.exercises,
  }));
  const { error: psErr } = await sb.from("programme_sessions").insert(progSessions);
  if (psErr) throw psErr;

  await sb.from("programme_assignments").insert({ programme_id: programme.id, athlete_id: athletes[1].id });
  console.log(`Seeded 1 programme, assigned to ${athletes[1].name}.`);
}

// ── 10. Community announcement ────────────────────────────────────────────────

async function seedCommunity(demoOrgId, coachId) {
  const { error } = await sb.from("announcements").insert({
    organisation_id: demoOrgId,
    coach_id: coachId,
    group_id: null,
    title: "Welcome to the squad app!",
    body: "This is where you'll find announcements, PB shoutouts, and training updates. Let's have a great block together.",
    pinned: true,
  });
  if (error) throw error;
  console.log("Seeded 1 pinned announcement.");
}

// ── Run ─────────────────────────────────────────────────────────────────────

async function main() {
  await resetExistingDemoOrg();
  const { org, coachId } = await createDemoOrgAndCoach();
  const { batteryId, metricIdByName } = await cloneTestingSetup(org.id);
  await seedLibrary(org.id);
  const { athletes } = await seedAthletes(org.id);
  await seedSessionsAndPBs(athletes);
  await seedPercentOneRM(athletes);
  await seedTesting(athletes, batteryId, metricIdByName);
  await seedTemplateAndProgramme(org.id, athletes);
  await seedCommunity(org.id, coachId);

  console.log("\nDemo org ready.");
  console.log("Org ID:", org.id);
  console.log("Visit /demo to sign in as the demo coach.");
}

main().catch((e) => {
  console.error("SEED FAILED:", e.message);
  process.exit(1);
});

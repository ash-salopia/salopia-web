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
    each_side: false,
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

// A simple progressive-overload log generator: starting weight, small
// increments week over week, occasional realistic gaps (a set left
// undone) so the data doesn't look robotically perfect.
function buildLog(sets, startWeight, increment, reps, allDone = true) {
  return Array.from({ length: sets }, (_, i) => {
    const done = allDone || i < sets - 1; // last set sometimes left open
    return {
      weight: done ? String(startWeight + increment) : "",
      reps: done ? String(reps) : "",
      time: "",
      done,
    };
  });
}

async function seedSessionsAndPBs(athletes) {
  const today = todayISO();
  const pbRows = [];
  const sessionExerciseRows = [];
  const sessionRows = [];

  // Map: session placeholder key -> index, so we can attach exercises after insert
  const plan = [];

  for (const athlete of athletes) {
    const base1RM = 60 + Math.round(Math.random() * 40); // per-athlete squat baseline
    let squatWeight = base1RM * 0.7;
    let benchWeight = base1RM * 0.5;

    // 3 weeks back through 1 week ahead, 2 sessions/week — so every
    // athlete has upcoming sessions on the calendar (not just logged
    // history), which keeps the dashboard's programme-expiry widget
    // from reading as a wall of "expired" for a demoing coach.
    for (let week = 3; week >= -1; week--) {
      for (const dayOffset of [1, 4]) {
        const date = addDaysISO(today, -(week * 7) - (7 - dayOffset));
        const isPast = date < today;
        squatWeight += isPast ? 2.5 : 0;
        benchWeight += isPast ? 1.25 : 0;

        const exercises = [
          {
            name: "Barbell Back Squat", sets: 4, reps: "5", rest: "2min",
            log: isPast ? buildLog(4, Math.round(squatWeight), 0, 5) : buildLog(4, 0, 0, 5, false).map(() => ({ weight: "", reps: "", time: "", done: false })),
          },
          {
            name: "Barbell Bench Press", sets: 3, reps: "6", rest: "90s",
            log: isPast ? buildLog(3, Math.round(benchWeight), 0, 6) : Array.from({ length: 3 }, () => ({ weight: "", reps: "", time: "", done: false })),
          },
          {
            name: "Chin Up", sets: 3, reps: "8", rest: "90s", is_bodyweight: true,
            log: isPast
              ? Array.from({ length: 3 }, (_, i) => ({ weight: "", reps: String(8 + i), time: "", done: true }))
              : Array.from({ length: 3 }, () => ({ weight: "", reps: "", time: "", done: false })),
          },
          {
            name: "Side Plank", sets: 2, reps: "", time: "45", rest: "60s", is_bodyweight: true,
            log: isPast
              ? Array.from({ length: 2 }, () => ({ weight: "", reps: "", time: "45", done: true }))
              : Array.from({ length: 2 }, () => ({ weight: "", reps: "", time: "", done: false })),
          },
        ];

        plan.push({
          athlete_id: athlete.id,
          type: "strength",
          date,
          name: dayOffset === 1 ? "Lower + Upper A" : "Lower + Upper B",
          exercises,
          isPast,
        });
      }
    }
  }

  // Insert sessions, then exercises (need session ids first)
  for (const s of plan) {
    const { data: session, error } = await sb
      .from("sessions")
      .insert({ athlete_id: s.athlete_id, type: s.type, date: s.date, name: s.name })
      .select()
      .single();
    if (error) throw error;

    const exRows = s.exercises.map((e, i) => defaultExerciseRow(session.id, i, e));
    const { error: exErr } = await sb.from("session_exercises").insert(exRows);
    if (exErr) throw exErr;

    if (s.isPast) {
      const squat = s.exercises.find((e) => e.name === "Barbell Back Squat");
      const bench = s.exercises.find((e) => e.name === "Barbell Bench Press");
      const chin = s.exercises.find((e) => e.name === "Chin Up");
      const plank = s.exercises.find((e) => e.name === "Side Plank");
      const maxOf = (log) => Math.max(...log.filter((l) => l.done && l.weight).map((l) => Number(l.weight)), 0);
      const maxReps = (log) => Math.max(...log.filter((l) => l.done && l.reps).map((l) => Number(l.reps)), 0);

      if (squat && maxOf(squat.log) > 0) {
        pbRows.push({ athlete_id: s.athlete_id, exercise_name: "Barbell Back Squat", date: s.date, session_id: session.id, weight_kg: maxOf(squat.log), reps: 5, time_seconds: null });
      }
      if (bench && maxOf(bench.log) > 0) {
        pbRows.push({ athlete_id: s.athlete_id, exercise_name: "Barbell Bench Press", date: s.date, session_id: session.id, weight_kg: maxOf(bench.log), reps: 6, time_seconds: null });
      }
      if (chin) {
        pbRows.push({ athlete_id: s.athlete_id, exercise_name: "Chin Up", date: s.date, session_id: session.id, weight_kg: null, reps: maxReps(chin.log), time_seconds: null });
      }
      if (plank) {
        pbRows.push({ athlete_id: s.athlete_id, exercise_name: "Side Plank", date: s.date, session_id: session.id, weight_kg: null, reps: null, time_seconds: 45 });
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

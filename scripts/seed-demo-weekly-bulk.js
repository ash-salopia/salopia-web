// Additive: fills out the demo athletes' weekly training so every week
// has more than the twice-weekly strength sessions - power/speed, zone-2
// running and hybrid intervals for a mix of athletes, plus check-ins on
// training days - for the last WEEKS_BACK weeks (logged ~88% of the time,
// with progressions the reports can show) and WEEKS_AHEAD weeks planned.
// Requested live: "bulk out the weekly training data for each demo athlete
// and add some power/speed/cardio sessions to some of them."
//
// Only INSERTS. A session is skipped if that athlete already has a
// session of the same type that week with the same name, and a day that
// already has any session is avoided (moved to the next free day), so
// it's safe to re-run. Check-ins are only added on days without one.
// Deterministic (seeded random) so a re-run produces the same numbers.
//
// Usage: node scripts/seed-demo-weekly-bulk.js
//        DRY_RUN=1 node scripts/seed-demo-weekly-bulk.js

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
const WEEKS_BACK = 12;
const WEEKS_AHEAD = 4;
const LOGGED_RATE = 0.88;
const DRY_RUN = process.env.DRY_RUN === "1";

// Which extra sessions each athlete gets (names must match the demo org).
const PLAN = {
  "Ava Thompson": { ps: true, run: true, hybrid: true, base: 0.0 },
  "Ethan Wright": { ps: true, run: true, hybrid: false, base: 0.4 },
  "Grace Mitchell": { ps: true, run: true, hybrid: false, base: 0.8 },
  "Jake Morrison": { ps: false, run: true, hybrid: true, base: 0.2 },
  "Liam O'Connor": { ps: false, run: true, hybrid: true, base: 0.6 },
  "Noah Patel": { ps: true, run: false, hybrid: false, base: 0.3 },
  "Sophie Bennett": { ps: false, run: true, hybrid: true, base: 0.7 },
  "Marcus Webb (VBT)": { ps: true, run: false, hybrid: false, base: 0.5 },
};
// Preferred weekday per session kind (0 = Monday); moved to the next free day if taken.
const DAY = { ps: 2, run: 3, hybrid: 5 };

// ── helpers ──────────────────────────────────────────────────────────────────
function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}
function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function mondayOf(iso) {
  const d = new Date(iso + "T12:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
}
// Seeded PRNG (mulberry32) so re-runs are stable.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
const r2 = (n) => Math.round(n * 100) / 100;
const pace = (minPerKm) => minPerKm.toFixed(2); // "5.04" - the app's placeholder format

// ── session builders ─────────────────────────────────────────────────────────
function psSession(athleteId, date, w, base, logged, rand) {
  const sprintBase = 1.98 - base * 0.06;
  const broadBase = 222 + base * 18;
  const boxBase = 55 + Math.round(base * 10 / 5) * 5;
  const mk = (n) => Array.from({ length: n }, () => ({}));
  const sprintSets = 3, sprintReps = 2;
  const broadSets = 3, broadReps = 3;
  const boxSets = 3, boxReps = 5;
  const box = boxBase + 5 * Math.floor(w / 4);
  const setLog = (sets, reps, fill) =>
    Array.from({ length: sets }, (_, si) => ({
      done: logged,
      set_metrics: fill.set ? fill.set(si) : {},
      rep_metrics: logged && fill.rep ? Array.from({ length: reps }, (_, ri) => fill.rep(si, ri)) : mk(reps),
      single_value: false,
      rpe: "",
      pain: "",
      set_notes: "",
    }));
  return {
    session: {
      athlete_id: athleteId,
      name: "Speed & Power",
      date,
      type: "power_speed",
      session_source: "programme",
      rpe: logged ? 6 + Math.round(rand() * 2) : null,
      duration_min: logged ? 40 + Math.round(rand() * 10) : null,
      rpe_logged_at: logged ? new Date(date + "T19:00:00Z").toISOString() : null,
    },
    exercises: [
      {
        name: "10m Sprint", order: "1", sets: sprintSets, reps: String(sprintReps), rest: "2min", ps_tracked_metrics: ["time"],
        log: setLog(sprintSets, sprintReps, { rep: () => ({ time: r2(sprintBase - 0.006 * w + (rand() - 0.5) * 0.05).toFixed(2) }) }),
      },
      {
        name: "Broad Jump", order: "2", sets: broadSets, reps: String(broadReps), rest: "90s", ps_tracked_metrics: ["distance_cm"],
        log: setLog(broadSets, broadReps, { rep: () => ({ distance_cm: String(Math.round(broadBase + 1.3 * w + (rand() - 0.5) * 8)) }) }),
      },
      {
        name: "Box Jump", order: "3", sets: boxSets, reps: String(boxReps), rest: "90s", ps_tracked_metrics: ["box_height", "reps"],
        log: setLog(boxSets, boxReps, { set: () => (logged ? { box_height: String(box), reps: String(boxReps) } : {}) }),
      },
    ],
  };
}

function runSession(athleteId, date, w, base, logged, rand) {
  const p = 5.35 - base * 0.25 - 0.02 * w + (rand() - 0.5) * 0.08; // min/km, improving
  const dist = r2(6 + (w % 4) * 0.5 + rand() * 0.6);
  const dur = Math.round(dist * p);
  const hr = Math.round(150 - base * 4 - 0.35 * w + (rand() - 0.5) * 4);
  const metrics = logged ? { distance: dist.toFixed(1), duration: String(dur), pace: pace(p), avg_hr: String(hr) } : {};
  return {
    session: {
      athlete_id: athleteId,
      name: "Aerobic run — Z2",
      date,
      type: "cardio",
      cardio_type: "continuous",
      session_source: "programme",
      rpe: logged ? 4 + Math.round(rand() * 2) : null,
      duration_min: logged ? dur : null,
      rpe_logged_at: logged ? new Date(date + "T19:00:00Z").toISOString() : null,
      cardio_config: {
        zone: 2,
        modality: "Run",
        duration: "40",
        tracked_metrics: ["distance", "duration", "pace", "avg_hr"],
        default_distance_unit: "km",
        metrics,
      },
    },
    exercises: [],
  };
}

function hybridSession(athleteId, date, w, base, logged, rand) {
  const ski = w % 2 === 0;
  const sets = ski ? 6 : 5;
  const repMin = (ski ? 2.05 : 1.95) - base * 0.06 - 0.008 * w; // minutes per 500m
  const rounds = Array.from({ length: sets }, (_, i) => ({
    duration: (repMin + i * 0.012 + (rand() - 0.5) * 0.03).toFixed(2),
    avg_hr: String(Math.round(166 - base * 3 + i * 1.5 - 0.3 * w + (rand() - 0.5) * 3)),
  }));
  return {
    session: {
      athlete_id: athleteId,
      // Distinct from the older demo "SkiErg intervals — 6×500m" sessions,
      // which logged total session minutes rather than per-500m times, so
      // the benchmark comparison never mixes the two.
      name: ski ? "SkiErg 6×500m" : "Row intervals — 5×500m",
      date,
      type: "hyrox",
      hyrox_type: "interval",
      session_source: "programme",
      rpe: logged ? 7 + Math.round(rand() * 2) : null,
      duration_min: logged ? 30 + Math.round(rand() * 6) : null,
      rpe_logged_at: logged ? new Date(date + "T19:00:00Z").toISOString() : null,
      hyrox_config: {
        exercise: ski ? "SkiErg" : "Row",
        sets: String(sets),
        workSec: "120",
        restSec: "90",
        zone: 4,
        tracked_metrics: ["duration", "avg_hr"],
        metrics: logged ? rounds : [],
      },
    },
    exercises: [],
  };
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  const { data: org } = await sb.from("organisations").select("id").eq("name", DEMO_ORG_NAME).single();
  if (!org) throw new Error("Demo org not found");
  const { data: athletes } = await sb.from("athletes").select("id, name").eq("organisation_id", org.id).eq("archived", false);
  const today = todayISO();
  const firstWeek = addDays(mondayOf(today), -7 * WEEKS_BACK);
  const lastWeek = addDays(mondayOf(today), 7 * WEEKS_AHEAD);
  const totals = { sessions: 0, checkins: 0, skipped: 0 };

  for (const a of athletes ?? []) {
    const plan = PLAN[a.name];
    if (!plan) continue;
    const rand = rng(hash(a.id));
    const { data: existing } = await sb
      .from("sessions")
      .select("date, type, name")
      .eq("athlete_id", a.id)
      .gte("date", firstWeek)
      .lte("date", addDays(lastWeek, 6));
    const taken = new Set((existing ?? []).map((s) => s.date));
    const haveWeekly = new Set((existing ?? []).map((s) => `${mondayOf(s.date)}|${s.type}|${s.name}`));
    const { data: cks } = await sb.from("checkins").select("date").eq("athlete_id", a.id).gte("date", firstWeek);
    const checkinDays = new Set((cks ?? []).map((c) => c.date));
    const newTrainingDays = [];

    for (let w = 0; w <= WEEKS_BACK + WEEKS_AHEAD; w++) {
      const monday = addDays(firstWeek, 7 * w);
      const kinds = [];
      if (plan.ps) kinds.push("ps");
      if (plan.run) kinds.push("run");
      if (plan.hybrid) kinds.push("hybrid");
      for (const kind of kinds) {
        let date = addDays(monday, DAY[kind]);
        let tries = 0;
        while (taken.has(date) && tries < 3) {
          date = addDays(date, 1);
          tries++;
        }
        if (taken.has(date)) {
          totals.skipped++;
          continue;
        }
        const past = date <= today;
        const logged = past && rand() < LOGGED_RATE;
        const built =
          kind === "ps" ? psSession(a.id, date, w, plan.base, logged, rand)
          : kind === "run" ? runSession(a.id, date, w, plan.base, logged, rand)
          : hybridSession(a.id, date, w, plan.base, logged, rand);
        const key = `${monday}|${built.session.type}|${built.session.name}`;
        if (haveWeekly.has(key)) {
          totals.skipped++;
          continue;
        }
        taken.add(date);
        haveWeekly.add(key);
        if (logged) newTrainingDays.push(date);
        totals.sessions++;
        if (DRY_RUN) continue;
        const { data: s, error } = await sb.from("sessions").insert(built.session).select("id").single();
        if (error) throw new Error(`${a.name} ${date} ${kind}: ${error.message}`);
        if (built.exercises.length) {
          const { error: exErr } = await sb.from("session_exercises").insert(
            built.exercises.map((e, i) => ({
              session_id: s.id,
              name: e.name,
              order: e.order,
              sets: e.sets,
              reps: e.reps,
              rest: e.rest,
              time: "",
              target_load: "",
              tempo: "",
              notes: "",
              video_url: "",
              sort_order: i,
              ps_tracked_metrics: e.ps_tracked_metrics,
              log: e.log,
            }))
          );
          if (exErr) throw new Error(`${a.name} ${date} exercises: ${exErr.message}`);
        }
      }
    }

    // Check-ins on the days they trained (existing strength days too), most
    // days, where there isn't one already.
    const { data: trainedPast } = await sb
      .from("sessions")
      .select("date, rpe, session_exercises(log)")
      .eq("athlete_id", a.id)
      .gte("date", firstWeek)
      .lte("date", today);
    const days = new Set(newTrainingDays);
    for (const s of trainedPast ?? []) {
      const done = s.rpe != null || (s.session_exercises ?? []).some((e) => (e.log ?? []).some((l) => l && l.done));
      if (done) days.add(s.date);
    }
    const rows = [];
    for (const d of [...days].sort()) {
      if (checkinDays.has(d) || rand() > 0.85) continue;
      const tired = rand() < 0.15;
      rows.push({
        athlete_id: a.id,
        date: d,
        energy: tired ? 2 : 3 + Math.round(rand() * 2),
        sleep: tired ? 2 : 3 + Math.round(rand() * 2),
        soreness: tired ? 4 : 1 + Math.round(rand() * 2),
        volume: 3,
      });
    }
    totals.checkins += rows.length;
    if (!DRY_RUN && rows.length) {
      const { error } = await sb.from("checkins").insert(rows);
      if (error) console.warn(`  check-ins for ${a.name}: ${error.message}`);
    }
    console.log(`${a.name.padEnd(20)} done`);
  }
  console.log(DRY_RUN ? "DRY RUN -" : "Inserted", totals);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Demo data for testing the training-load / return-to-play monitoring
// feature (migration 0088). Creates ONE new athlete in the "VIS BUILD
// Demo" org, named "<name> (RTP)", coming back from a grade-2 left
// hamstring strain, with ~13 weeks of realistic data:
//
//   Weeks 1-4   REHAB     — low daily load, high pain (6 -> 4). Training
//                           almost every day on the same circuit => HIGH
//                           MONOTONY.
//   Weeks 5-9   MODIFIED  — building back, pain 4 -> 2.
//   Weeks 10-12 RTP BUILD — near-full training, flat-ish load, pain 2 -> 1.
//   Week  13    SPIKE     — this (partial) week: match + heavy conditioning
//                           => current ACWR jumps into the spike band and
//                           the weekly-load spike flag fires.
//
// Every training day gets a session with a real duration_min + session
// RPE (so sRPE load is computed for every type), plus a daily check-in
// with fatigue / stress / pain that tapers as they return to play. The
// athlete's current rtp_status is "return_to_play" since week 9.
//
// Exercises what to look at:
//   • Athletes list      -> "Return to play" badge
//   • Coach dashboard    -> "Availability" panel + "Load flags" panel
//   • Athlete page       -> Dashboard tab: ACWR + Availability tiles
//   • Reporting          -> Athlete report, tick "Training load & ACWR",
//                           26-week range: ACWR chart w/ spike, weekly
//                           load + %-change, monotony/strain table
//   • Athlete link       -> a logged "Sport / Other" session, check-in
//                           with pain questions
//
// Safe to re-run: deletes any existing "(RTP)" athlete in the demo org
// first (sessions + check-ins cascade), then rebuilds.
//
// Usage: node scripts/seed-training-load-rtp-demo.js
// Requires migration 0088 applied to the linked DB.

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
const ATHLETE_NAME = "Rico Alvarez (RTP)";

// ── date helpers ────────────────────────────────────────────────────────────
function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}
function addDaysISO(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function mondayOnOrBefore(iso) {
  const d = new Date(iso + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}
const rnd = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── phase plan ─────────────────────────────────────────────────────────────
// perWeek -> which weekday offsets (0=Mon) get a session
const DOW_BY_COUNT = {
  3: [0, 2, 4],
  4: [0, 1, 3, 5],
  5: [0, 1, 3, 4, 6],
  6: [0, 1, 2, 4, 5, 6],
};

// session templates per phase. { kind, name, dur, rpe, [logged] }
// kind: "sport" | "cardio" | "strength". logged:true => session_source
// "athlete_logged" (the athlete added it themselves).
const MENUS = {
  rehab: [
    { kind: "sport", name: "Hamstring rehab circuit", dur: 32, rpe: 3 },
    { kind: "cardio", name: "Aqua jog", dur: 30, rpe: 3, cardio: "continuous" },
    { kind: "strength", name: "Isometrics + upper body", dur: 35, rpe: 3, ex: "isoUpper" },
    { kind: "sport", name: "Hamstring rehab circuit", dur: 30, rpe: 3 },
    { kind: "cardio", name: "Recovery bike", dur: 33, rpe: 3, cardio: "continuous" },
    { kind: "strength", name: "Isometrics + upper body", dur: 32, rpe: 4, ex: "isoUpper" },
  ],
  modified: [
    { kind: "cardio", name: "Return-to-run intervals", dur: 38, rpe: 5, cardio: "cardioIntervals" },
    { kind: "sport", name: "Modified pitch session", dur: 50, rpe: 5, logged: true },
    { kind: "strength", name: "Lower-body strength", dur: 55, rpe: 6, ex: "lower" },
    { kind: "strength", name: "Upper + core", dur: 45, rpe: 5, ex: "upper" },
    { kind: "sport", name: "Change-of-direction drills", dur: 40, rpe: 5 },
  ],
  build: [
    { kind: "sport", name: "Team training (non-contact)", dur: 70, rpe: 6, logged: true },
    { kind: "cardio", name: "Tempo run", dur: 35, rpe: 6, cardio: "continuous" },
    { kind: "strength", name: "Lower-body strength", dur: 60, rpe: 7, ex: "lower" },
    { kind: "sport", name: "5-a-side", dur: 50, rpe: 6, logged: true },
    { kind: "strength", name: "Upper + core", dur: 45, rpe: 6, ex: "upper" },
  ],
  spike: [
    { kind: "sport", name: "Full team training", dur: 90, rpe: 7, logged: true },
    { kind: "sport", name: "Match", dur: 85, rpe: 8, logged: true },
    { kind: "strength", name: "Lower-body strength", dur: 65, rpe: 7, ex: "lower" },
    { kind: "cardio", name: "Conditioning — 10×200m", dur: 35, rpe: 8, cardio: "cardioIntervals" },
    { kind: "sport", name: "Skills session", dur: 55, rpe: 6, logged: true },
    { kind: "strength", name: "Upper power", dur: 50, rpe: 7, ex: "upper" },
    { kind: "sport", name: "Extra running block", dur: 40, rpe: 7, logged: true },
  ],
};

// week (1-13) -> { phase, perWeek, pain }
function weekPlan(w) {
  if (w <= 4) return { phase: "rehab", perWeek: 6, pain: [6, 6, 5, 4][w - 1] };
  if (w <= 9) return { phase: "modified", perWeek: 4, pain: [4, 4, 3, 3, 2][w - 5] };
  if (w <= 12) return { phase: "build", perWeek: 4, pain: [2, 2, 1][w - 10] };
  return { phase: "spike", perWeek: 6, pain: 1 };
}

const EX_MENUS = {
  isoUpper: [
    { name: "Iso Wall Sit", sets: 4, reps: "45s hold", w: [null, null, null, null] },
    { name: "Bench Press", sets: 3, reps: "8", w: [60, 60, 60] },
    { name: "Chest-Supported Row", sets: 3, reps: "10", w: [40, 40, 40] },
    { name: "Dead Bug", sets: 3, reps: "10", w: [null, null, null] },
  ],
  lower: [
    { name: "Trap Bar Deadlift", sets: 4, reps: "5", w: [110, 115, 120, 120] },
    { name: "Bulgarian Split Squat", sets: 3, reps: "8", w: [24, 24, 24] },
    { name: "Nordic Hamstring Curl", sets: 3, reps: "6", w: [null, null, null] },
    { name: "Barbell Hip Thrust", sets: 3, reps: "10", w: [100, 100, 100] },
  ],
  upper: [
    { name: "Bench Press", sets: 4, reps: "6", w: [70, 72.5, 75, 75] },
    { name: "Weighted Chin-up", sets: 3, reps: "6", w: [10, 10, 12.5] },
    { name: "Single-Arm DB Row", sets: 3, reps: "10", w: [34, 34, 34], each_side: true },
    { name: "Pallof Press", sets: 3, reps: "12", w: [15, 15, 15], each_side: true },
  ],
};

function exerciseRows(sessionId, key) {
  return EX_MENUS[key].map((e, i) => ({
    session_id: sessionId,
    name: e.name,
    order: String(i + 1),
    sets: e.sets,
    reps: e.reps,
    time: "",
    rest: "90s",
    target_load: "",
    tempo: "2-0-2",
    each_side: e.each_side ?? false,
    notes: "",
    sort_order: i,
    is_bodyweight: e.w.every((x) => x == null),
    log: e.w.map((weight) => ({
      weight: weight == null ? "" : String(weight),
      reps: String(e.reps).replace(/[^0-9].*$/, "") || "8",
      time: "",
      done: true,
    })),
  }));
}

function cardioConfig(sub, durMin) {
  if (sub === "cardioIntervals") {
    return {
      modality: "Run", reps: "8", workDur: "200", workDist: "", restDur: "100", restType: "easy jog",
      tracked_metrics: ["duration", "pace", "avg_hr"], default_distance_unit: "km",
    };
  }
  return {
    modality: "Run", duration: String(durMin), distance: "",
    tracked_metrics: ["distance", "duration", "pace", "avg_hr"], default_distance_unit: "km",
  };
}

const SPORT_NOTES = [
  "Hamstring felt solid, no reaction.",
  "Slight tightness after the sprints — iced it after, fine now.",
  "Good session, moving freely.",
  "Bit of DOMS in the glute/ham, nothing sharp.",
  "Felt strong, back to competing for the ball.",
];

function historicCheckIn(dayIdx, painBase) {
  const pain = clamp(painBase + rnd(-1, 1), 0, 10);
  const soreness = clamp(Math.round(painBase / 2) + rnd(0, 1), 1, 5);
  const fatigue = painBase >= 4 ? rnd(3, 4) : rnd(2, 3);
  const stress = rnd(2, 4);
  const energy = clamp(5 - fatigue + rnd(0, 1), 2, 5);
  const sleep = Math.random() < 0.15 ? 2 : rnd(3, 4);
  const volume = painBase >= 5 ? 2 : painBase >= 3 ? 3 : rnd(3, 5);
  const row = { energy, sleep, soreness, volume, fatigue, stress, pain_score: pain };
  if (pain > 0) row.pain_location = "L hamstring";
  if (dayIdx % 11 === 0) {
    row.wellness_notes = pain >= 4
      ? "Still feeling it on the change of direction — being cautious."
      : pain >= 1
        ? "Minor awareness only, happy to push on."
        : "Feeling back to normal, no complaints.";
  }
  return row;
}

async function main() {
  const { data: org, error: orgErr } = await sb
    .from("organisations").select("id").eq("name", DEMO_ORG_NAME).single();
  if (orgErr || !org) {
    console.error(`No "${DEMO_ORG_NAME}" org found — run scripts/seed-demo-org.js first.`);
    process.exit(1);
  }

  // Wipe any previous "(RTP)" athlete.
  const { data: existing } = await sb
    .from("athletes").select("id, name").eq("organisation_id", org.id).ilike("name", "%(RTP)%");
  for (const a of existing ?? []) {
    await sb.from("checkins").delete().eq("athlete_id", a.id);
    await sb.from("athletes").delete().eq("id", a.id);
    console.log(`Removed existing "${a.name}".`);
  }

  const start = mondayOnOrBefore(addDaysISO(todayISO(), -90));
  const rtpSince = addDaysISO(start, 9 * 7); // start of week 10 (RTP build)

  // Create the athlete. Hard-require migration 0088 (rtp_status column).
  const { data: athlete, error: aErr } = await sb
    .from("athletes")
    .insert({
      organisation_id: org.id,
      name: ATHLETE_NAME,
      group: "1st Team",
      sex: "male",
      date_of_birth: "1998-06-22",
      bodyweight_kg: 78,
      rtp_status: "return_to_play",
      rtp_note: "L hamstring strain (grade 2) — cleared for full training, load monitored on return.",
      rtp_since: rtpSince,
    })
    .select("id, share_token")
    .single();
  if (aErr) {
    if (/column .*(rtp_status|rtp_note|rtp_since)/i.test(aErr.message)) {
      console.error("Migration 0088 not applied — apply supabase/migrations/0088_training_load_monitoring.sql first.");
      process.exit(1);
    }
    throw aErr;
  }

  const today = todayISO();
  let sessionCount = 0;
  let athleteLoggedCount = 0;
  let noteCount = 0;

  for (let w = 1; w <= 13; w++) {
    const wp = weekPlan(w);
    const menu = MENUS[wp.phase];
    const weekStart = addDaysISO(start, (w - 1) * 7);
    const dows = DOW_BY_COUNT[wp.perWeek];

    for (let di = 0; di < dows.length; di++) {
      const date = addDaysISO(weekStart, dows[di]);
      if (date > today) continue;
      const tpl = menu[(di + w) % menu.length];
      // Rehab is deliberately samey day to day (that's the point — it drives
      // the high-monotony flag), so skip the jitter there.
      const jitter = wp.phase === "rehab" ? 0 : 1;
      const rpe = clamp(tpl.rpe + jitter * rnd(-1, 1), 1, 10);
      const dur = clamp(tpl.dur + jitter * rnd(-5, 5), 10, 120);
      const loggedAt = new Date(date + "T18:30:00Z").toISOString();

      const base = {
        athlete_id: athlete.id,
        name: tpl.name,
        date,
        rpe,
        rpe_logged_at: loggedAt,
        duration_min: dur,
      };

      if (tpl.kind === "sport") {
        const wantNote = tpl.logged && Math.random() < 0.35 && noteCount < 5;
        const { error } = await sb.from("sessions").insert({
          ...base,
          type: "sport",
          session_source: tpl.logged ? "athlete_logged" : "programme",
          sport_config: { planned: { duration_min: tpl.dur, rpe: tpl.rpe } },
          athlete_notes: wantNote ? SPORT_NOTES[noteCount] : null,
          athlete_notes_acknowledged: !wantNote,
        });
        if (error) {
          if (/violates check constraint .*type/i.test(error.message)) {
            console.error("Migration 0088 not applied — the 'sport' session type is rejected. Apply 0088 first.");
            process.exit(1);
          }
          throw error;
        }
        if (tpl.logged) athleteLoggedCount++;
        if (wantNote) noteCount++;
      } else if (tpl.kind === "cardio") {
        const { error } = await sb.from("sessions").insert({
          ...base,
          type: "cardio",
          cardio_type: tpl.cardio,
          cardio_config: cardioConfig(tpl.cardio, dur),
        });
        if (error) throw error;
      } else {
        const { data: sess, error } = await sb.from("sessions").insert({
          ...base,
          type: "strength",
        }).select("id").single();
        if (error) throw error;
        const { error: exErr } = await sb.from("session_exercises").insert(exerciseRows(sess.id, tpl.ex));
        if (exErr) throw exErr;
      }
      sessionCount++;
    }
  }

  // ── Daily check-ins across the whole window ───────────────────────────────
  const checkRows = [];
  for (let d = 0; d <= 90; d++) {
    const date = addDaysISO(start, d);
    if (date > today) break;
    const w = Math.floor(d / 7) + 1;
    const painBase = weekPlan(Math.min(w, 13)).pain;
    checkRows.push({ athlete_id: athlete.id, date, ...historicCheckIn(d, painBase) });
  }
  // insert in chunks
  for (let i = 0; i < checkRows.length; i += 100) {
    const { error } = await sb.from("checkins").insert(checkRows.slice(i, i + 100));
    if (error) {
      if (/column .*(fatigue|stress|pain_score|pain_location|wellness_notes)/i.test(error.message)) {
        console.error("Migration 0088 not applied — check-in wellness/pain columns missing. Apply 0088 first.");
        process.exit(1);
      }
      throw error;
    }
  }

  const origin = (env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  console.log(`\n✓ Seeded "${ATHLETE_NAME}" in "${DEMO_ORG_NAME}".`);
  console.log(`  ${sessionCount} sessions over 13 weeks (${start} → ${today}), ${athleteLoggedCount} athlete-logged, ${noteCount} with athlete notes.`);
  console.log(`  ${checkRows.length} daily check-ins with fatigue / stress / pain.`);
  console.log(`  RTP status: return_to_play since ${rtpSince}.`);
  console.log(`\n  Expected in the app (needs load-monitoring toggle ON in Settings):`);
  console.log(`   • Athletes list  → "Return to play" badge`);
  console.log(`   • Dashboard      → "Availability" panel + "Load flags" (ACWR spike / week +% / monotony)`);
  console.log(`   • Athlete page   → Dashboard tab: ACWR + Availability tiles`);
  console.log(`   • Reporting      → tick "Training load & ACWR", 26-week range:`);
  console.log(`                      ACWR climbs into the spike band by weeks 12-13, weekly-load`);
  console.log(`                      spike vs 4-week average, elevated monotony in the modified phase`);
  console.log(`\n  Athlete link: ${origin}/a/${athlete.share_token}`);
  console.log(`  Coach view:   /demo → Athletes → "${ATHLETE_NAME}"`);
}

main().catch((e) => {
  console.error("SEED FAILED:", e.message);
  process.exit(1);
});

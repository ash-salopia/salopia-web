// Demo data for testing the MAS & heart-rate training-zone feature
// (migration 0086). Creates ONE new athlete in the "VIS BUILD Demo"
// org, named "<name> (MAS)" so it's obvious which athlete to open, with
// a full aerobic profile (Max HR, resting HR, MAS) and a repeating
// weekly block of Cardio / Hybrid sessions with Z1–Z5 prescribed on
// their segments — logged history for the last HISTORY_WEEKS, planned
// through END_DATE.
//
// Safe to re-run: it deletes any existing "(MAS)" athlete in the demo
// org first (their sessions cascade), then rebuilds.
//
// Usage: node scripts/seed-mas-hr-zones-demo.js
// Requires migration 0086 applied to the linked DB.

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
const ATHLETE_NAME = "Marcus Vale (MAS)";

// Aerobic profile — realistic trained-endurance-athlete numbers.
const MAX_HR = 192;
const RESTING_HR = 48;
const MAS_KMH = 17.5;

const HISTORY_WEEKS = 6; // weeks of logged history before today
const END_DATE = "2026-12-31"; // planned sessions run through here

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}
function addDaysISO(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── Zone maths (mirrors lib/training-zones.ts DEFAULT_ZONE_MODEL) ─────────────
const ZONES = [
  { n: 1, name: "Recovery", hrLo: 50, hrHi: 68, masLo: 55, masHi: 68 },
  { n: 2, name: "Endurance", hrLo: 68, hrHi: 80, masLo: 68, masHi: 80 },
  { n: 3, name: "Tempo", hrLo: 80, hrHi: 87, masLo: 80, masHi: 88 },
  { n: 4, name: "Threshold", hrLo: 87, hrHi: 93, masLo: 88, masHi: 95 },
  { n: 5, name: "VO2 Max", hrLo: 93, hrHi: 100, masLo: 95, masHi: 115 },
];
function pace(kmh) {
  const s = 3600 / kmh;
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}
function zoneLine(z) {
  const hrLo = Math.round(RESTING_HR + (z.hrLo / 100) * (MAX_HR - RESTING_HR));
  const hrHi = Math.round(RESTING_HR + (z.hrHi / 100) * (MAX_HR - RESTING_HR));
  const spLo = MAS_KMH * (z.masLo / 100);
  const spHi = MAS_KMH * (z.masHi / 100);
  return `  Z${z.n} ${z.name.padEnd(18)} ${hrLo}-${hrHi} bpm   ${pace(spHi)}-${pace(spLo)} /km   ${spLo.toFixed(1)}-${spHi.toFixed(1)} km/h`;
}

async function main() {
  const { data: org, error: orgErr } = await sb
    .from("organisations").select("id, settings").eq("name", DEMO_ORG_NAME).single();
  if (orgErr || !org) {
    console.error(`No "${DEMO_ORG_NAME}" org found — run scripts/seed-demo-org.js first.`);
    process.exit(1);
  }

  // Wipe any previous "(MAS)" athlete (sessions cascade on delete).
  const { data: existing } = await sb
    .from("athletes").select("id, name").eq("organisation_id", org.id).ilike("name", "%(MAS)%");
  for (const a of existing ?? []) {
    await sb.from("athletes").delete().eq("id", a.id);
    console.log(`Removed existing "${a.name}".`);
  }

  // Create the athlete with the aerobic profile. Retry without the 0086
  // columns if the migration hasn't been applied.
  const base = {
    organisation_id: org.id,
    name: ATHLETE_NAME,
    group: "Endurance",
    sex: "male",
    date_of_birth: "2004-03-18",
    bodyweight_kg: 71.5,
  };
  let athlete;
  {
    const { data, error } = await sb
      .from("athletes")
      .insert({ ...base, max_hr: MAX_HR, resting_hr: RESTING_HR, mas_kmh: MAS_KMH })
      .select("id, share_token, max_hr, mas_kmh")
      .single();
    if (error && /column .*(max_hr|resting_hr|mas_kmh)/i.test(error.message)) {
      console.warn("⚠  migration 0086 not applied — creating the athlete without the aerobic profile.");
      const retry = await sb.from("athletes").insert(base).select("id, share_token").single();
      if (retry.error) throw retry.error;
      athlete = retry.data;
    } else if (error) {
      throw error;
    } else {
      athlete = data;
    }
  }

  // ── Sessions, each with a zone prescribed on its segment(s) ────────────────
  // The same 4-session week (Z2 base run / Z4 intervals / Z3 threshold /
  // Z4 SkiErg, on cycle days 0/2/4/5) repeats from HISTORY_WEEKS back
  // through END_DATE, anchored so a cycle starts today — the Z2 run is
  // always today's session. Past sessions are logged (metrics + RPE +
  // duration, pace/HR improving slightly week on week); today onward are
  // planned and unlogged.
  const t = todayISO();
  const rnd = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const paceStr = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

  function weekSessions(cycleStart, weeksAgo) {
    const fit = weeksAgo * 3; // seconds/km slower the further back
    return [
      {
        name: "Aerobic base run — Z2",
        date: cycleStart,
        type: "cardio",
        cardio_type: "continuous",
        cardio_config: {
          modality: "Run", duration: "50", distance: "",
          zone: 2,
          tracked_metrics: ["distance", "duration", "pace", "avg_hr"],
          default_distance_unit: "km",
        },
        logged: (dur) => {
          const paceSec = 268 + fit + rnd(-4, 4);
          return { rpe: rnd(4, 5), metrics: { duration: String(dur), distance: (dur / (paceSec / 60)).toFixed(1), pace: paceStr(paceSec), avg_hr: String(146 + rnd(-4, 4)) } };
        },
        dur: 50,
      },
      {
        name: "VO2max intervals — 6×3min Z4",
        date: addDaysISO(cycleStart, 2),
        type: "cardio",
        cardio_type: "cardioIntervals",
        cardio_config: {
          modality: "Run", reps: "6", workDur: "180", workDist: "", restDur: "120", restType: "easy jog",
          zone: 4,
          tracked_metrics: ["duration", "pace", "avg_hr"],
          default_distance_unit: "km",
        },
        logged: (dur) => ({ rpe: rnd(7, 8), metrics: { duration: String(dur), pace: paceStr(218 + fit + rnd(-3, 3)), avg_hr: String(172 + rnd(-3, 3)) } }),
        dur: 45,
      },
      {
        name: "Threshold — 2×15min Z3",
        date: addDaysISO(cycleStart, 4),
        type: "cardio",
        cardio_type: "threshold",
        cardio_config: {
          modality: "Run",
          tracked_metrics: ["duration", "pace", "avg_hr"],
          default_distance_unit: "km",
          blocks: [
            { label: "Warm-up", duration: "12", repeat: 1, zone: 1, metrics: {} },
            { label: "Main set", duration: "15", repeat: 2, rest: "3 min easy", zone: 3, metrics: {} },
            { label: "Cool-down", duration: "10", repeat: 1, zone: 1, metrics: {} },
          ],
        },
        logged: (dur) => ({ rpe: rnd(6, 7), metrics: { duration: String(dur), pace: paceStr(236 + fit + rnd(-3, 3)), avg_hr: String(162 + rnd(-3, 3)) } }),
        dur: 55,
      },
      {
        name: "SkiErg intervals — 5×500m Z4",
        date: addDaysISO(cycleStart, 5),
        type: "hyrox",
        hyrox_type: "interval",
        hyrox_config: {
          exercise: "SkiErg", load: "", sets: "5", workSec: "120", restSec: "90",
          zone: 4,
          tracked_metrics: ["duration", "avg_hr"],
          default_distance_unit: "m",
        },
        logged: (dur) => ({ rpe: rnd(7, 8), metrics: { duration: String(dur), avg_hr: String(168 + rnd(-4, 4)) } }),
        dur: 30,
      },
    ];
  }

  const sessions = [];
  for (let w = -HISTORY_WEEKS; ; w++) {
    const cycleStart = addDaysISO(t, w * 7);
    if (cycleStart > END_DATE) break;
    for (const s of weekSessions(cycleStart, Math.max(0, -w))) {
      if (s.date <= END_DATE) sessions.push(s);
    }
  }

  let loggedCount = 0;
  for (const s of sessions) {
    const row = {
      athlete_id: athlete.id,
      name: s.name,
      date: s.date,
      type: s.type,
      hyrox_type: s.hyrox_type ?? null,
      hyrox_config: s.hyrox_config ?? null,
      cardio_type: s.cardio_type ?? null,
      cardio_config: s.cardio_config ?? null,
    };
    if (s.date < t) {
      const dur = s.dur + rnd(-3, 3);
      const { rpe, metrics } = s.logged(dur);
      row.rpe = rpe;
      row.rpe_logged_at = new Date(s.date + "T18:30:00Z").toISOString();
      row.duration_min = dur;
      if (row.cardio_config) row.cardio_config = { ...row.cardio_config, metrics };
      if (row.hyrox_config) row.hyrox_config = { ...row.hyrox_config, metrics };
      loggedCount++;
    }
    const { error } = await sb.from("sessions").insert(row);
    if (error) throw error;
  }

  const origin = (env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  console.log(`\n✓ Seeded "${ATHLETE_NAME}" in "${DEMO_ORG_NAME}" with ${sessions.length} zoned sessions (${loggedCount} logged, ${sessions[0].date} → ${sessions[sessions.length - 1].date}).`);
  if (athlete.max_hr) {
    console.log(`  Aerobic profile: Max HR ${MAX_HR} · Resting ${RESTING_HR} · MAS ${MAS_KMH} km/h`);
    console.log(`  Expected zone table (Karvonen HR, default model):`);
    for (const z of ZONES) console.log(zoneLine(z));
  }
  console.log(`\n  Athlete link: ${origin}/a/${athlete.share_token}`);
  console.log(`  Coach view:   sign in via /demo → Athletes → "${ATHLETE_NAME}"`);
  console.log(`    • Manage → Profile → 🫀 Aerobic profile (zone table)`);
  console.log(`    • open a session → the Cardio/Hybrid builder shows the zone picker + targets`);
  console.log(`    • athlete link → session shows "Target zone", Settings → 🫀 Training zones`);
}

main().catch((e) => {
  console.error("SEED FAILED:", e.message);
  process.exit(1);
});

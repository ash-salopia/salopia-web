// Demo data for testing the MAS & heart-rate training-zone feature
// (migration 0086). Creates ONE new athlete in the "VIS BUILD Demo"
// org, named "<name> (MAS)" so it's obvious which athlete to open, with
// a full aerobic profile (Max HR, resting HR, MAS) and a handful of
// Cardio / Hybrid sessions that already have Z1–Z5 prescribed on their
// segments.
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
  { n: 1, name: "Recovery", hrLo: 50, hrHi: 68, masLo: 55, masHi: 70 },
  { n: 2, name: "Aerobic", hrLo: 68, hrHi: 80, masLo: 70, masHi: 80 },
  { n: 3, name: "Tempo / Threshold", hrLo: 80, hrHi: 88, masLo: 80, masHi: 90 },
  { n: 4, name: "VO2max", hrLo: 88, hrHi: 95, masLo: 90, masHi: 105 },
  { n: 5, name: "Speed / Anaerobic", hrLo: 95, hrHi: 100, masLo: 105, masHi: 130 },
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
  const t = todayISO();
  const sessions = [
    {
      name: "Aerobic base run — Z2",
      date: t,
      type: "cardio",
      cardio_type: "continuous",
      cardio_config: {
        modality: "Run", duration: "50", distance: "",
        zone: 2,
        tracked_metrics: ["distance", "duration", "pace", "avg_hr"],
        default_distance_unit: "km",
      },
    },
    {
      name: "VO2max intervals — 6×3min Z4",
      date: addDaysISO(t, 2),
      type: "cardio",
      cardio_type: "cardioIntervals",
      cardio_config: {
        modality: "Run", reps: "6", workDur: "180", workDist: "", restDur: "120", restType: "easy jog",
        zone: 4,
        tracked_metrics: ["duration", "pace", "avg_hr"],
        default_distance_unit: "km",
      },
    },
    {
      name: "Threshold — 2×15min Z3",
      date: addDaysISO(t, 4),
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
    },
    {
      name: "SkiErg intervals — 5×500m Z4",
      date: addDaysISO(t, 5),
      type: "hyrox",
      hyrox_type: "interval",
      hyrox_config: {
        exercise: "SkiErg", load: "", sets: "5", workSec: "120", restSec: "90",
        zone: 4,
        tracked_metrics: ["duration", "avg_hr"],
        default_distance_unit: "m",
      },
    },
  ];

  for (const s of sessions) {
    const { error } = await sb.from("sessions").insert({
      athlete_id: athlete.id,
      name: s.name,
      date: s.date,
      type: s.type,
      hyrox_type: s.hyrox_type ?? null,
      hyrox_config: s.hyrox_config ?? null,
      cardio_type: s.cardio_type ?? null,
      cardio_config: s.cardio_config ?? null,
    });
    if (error) throw error;
  }

  const origin = (env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  console.log(`\n✓ Seeded "${ATHLETE_NAME}" in "${DEMO_ORG_NAME}" with ${sessions.length} zoned sessions.`);
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

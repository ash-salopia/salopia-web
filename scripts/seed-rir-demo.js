// Demo data for the Target RIR load-prescription feature (migration
// 0112). Creates ONE new athlete in the "VIS BUILD Demo" org, named
// "<name> (RIR)" so it's obvious which athlete to open (same
// convention as "Marcus Vale (MAS)" / "Rico Alvarez (RTP)"), with a
// fixed 1RM on her two main lifts and a 6-week RIR block (two waves:
// 8 reps then 5 reps, each stepping 3 -> 2 -> 1 RIR). Week 4 is today
// and unlogged, so opening it live shows the suggested-kg placeholder
// computed straight from the RIR table (lib/rir-load.ts), the
// headline moment of the feature. Ordinary twice-weekly strength
// sessions surround the block so her calendar has the same no-gaps
// coverage (through END_DATE) as every other demo athlete.
//
// Safe to re-run: deletes any existing "(RIR)" athlete in the demo
// org first (sessions cascade), then rebuilds.
//
// Usage: node scripts/seed-rir-demo.js
// Requires migration 0112 applied to the linked DB.

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
const ATHLETE_NAME = "Priya Anand (RIR)";
const END_DATE = "2026-12-31"; // calendar coverage runs through here

const SQUAT_1RM = 140; // kg — fixed manual 1RM, so the RIR suggestion has
const BENCH_1RM = 92.5; // an immediate, deterministic source (no reliance
                         // on rolling-history estimation for the demo).

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}
function addDaysISO(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// Same reps×RIR table as lib/rir-load.ts (rows for the rep counts this
// block uses, RIR 0-3), inlined so the seed script has no dependency on
// the TS build.
function pctFromRepsRIR(reps, rir) {
  const table = {
    5: [86, 83, 81, 78], // RIR 0,1,2,3
    8: [79, 76, 74, 71],
  };
  return table[reps][rir];
}
function suggestedKg(oneRM, reps, rir) {
  const pct = pctFromRepsRIR(reps, rir);
  return Math.round(((oneRM * pct) / 100) * 2) / 2;
}
function roundHalf(w) {
  return Math.round(w * 2) / 2;
}
function emptyLog(n) {
  return Array.from({ length: n }, () => ({ weight: "", reps: "", time: "", done: false }));
}

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
    each_side: false,
    notes: over.notes ?? "",
    video_url: "",
    session_notes: "",
    progress: "",
    progress_reminder: false,
    sort_order: sortOrder,
    is_bodyweight: over.is_bodyweight ?? false,
    percent_1rm: null,
    use_percent_1rm: false,
    set_percents: [],
    use_rir: over.use_rir ?? false,
    set_rir: over.set_rir ?? [],
    athlete_exercise_notes: "",
    log: over.log,
  };
}

async function main() {
  const { data: org, error: orgErr } = await sb
    .from("organisations").select("id").eq("name", DEMO_ORG_NAME).single();
  if (orgErr || !org) {
    console.error(`No "${DEMO_ORG_NAME}" org found — run scripts/seed-demo-org.js first.`);
    process.exit(1);
  }

  const { data: existing } = await sb
    .from("athletes").select("id, name").eq("organisation_id", org.id).ilike("name", "%(RIR)%");
  for (const a of existing ?? []) {
    await sb.from("athletes").delete().eq("id", a.id);
    console.log(`Removed existing "${a.name}".`);
  }

  const { data: athlete, error: athErr } = await sb
    .from("athletes")
    .insert({
      organisation_id: org.id,
      name: ATHLETE_NAME,
      group: "Senior Squad",
      sex: "female",
      date_of_birth: "2002-11-02",
      bodyweight_kg: 64,
    })
    .select("id, share_token")
    .single();
  if (athErr) throw athErr;

  // Fixed 1RMs — resolveCurrentOneRM checks this table FIRST, before any
  // rolling estimate, so the RIR suggestion is deterministic the moment
  // this script finishes (no dependency on enough logged history existing).
  const { error: ormErr } = await sb.from("athlete_one_rms").insert([
    { athlete_id: athlete.id, exercise_name: "Barbell Back Squat", one_rm_kg: SQUAT_1RM },
    { athlete_id: athlete.id, exercise_name: "Barbell Bench Press", one_rm_kg: BENCH_1RM },
  ]);
  if (ormErr) throw ormErr;

  const t = todayISO();

  // The 6-week RIR block is the actual feature demo: two 3-week waves,
  // each stepping target RIR 3 -> 2 -> 1 toward its peak. Wave 1 is
  // 8-rep work, wave 2 drops to 5 reps (heavier %1RM at the same RIR) —
  // a common accumulation -> intensification shape. Week 4 (first
  // session of wave 2) is today, deliberately left unlogged so opening
  // it shows the live suggested-kg placeholder; weeks 5-6 are upcoming
  // and show the same. Weeks 1-3 are already logged (reps achieved
  // match what was asked, at the suggested kg).
  const BLOCK = [
    { reps: 8, rir: 3 }, { reps: 8, rir: 2 }, { reps: 8, rir: 1 },
    { reps: 5, rir: 3 }, { reps: 5, rir: 2 }, { reps: 5, rir: 1 },
  ];
  const BLOCK_START_WEEK = -3; // week 4 of the block lands on today
  const rirBlock = BLOCK.map(({ reps, rir }, i) => {
    const date = addDaysISO(t, (BLOCK_START_WEEK + i) * 7);
    const isPast = date < t;
    const squatKg = suggestedKg(SQUAT_1RM, reps, rir);
    const benchKg = suggestedKg(BENCH_1RM, reps, rir);
    return {
      name: `RIR Block W${i + 1} — ${reps} reps @ ${rir} RIR`,
      date,
      exercises: [
        {
          name: "Barbell Back Squat", sets: 4, reps: String(reps), rest: "2min30s",
          use_rir: true, set_rir: ["", String(rir), String(rir), String(rir)], // set 1 is a ramp-up, no RIR target
          notes: `Working sets @ ${rir} RIR — bar speed should still look crisp on the last rep.`,
          log: isPast
            ? Array.from({ length: 4 }, (_, si) => ({
                weight: si === 0 ? String(roundHalf(squatKg * 0.8)) : String(squatKg),
                reps: String(reps), time: "", done: true,
              }))
            : emptyLog(4),
        },
        {
          name: "Barbell Bench Press", sets: 3, reps: String(reps), rest: "2min",
          use_rir: true, set_rir: [String(rir), String(rir), String(rir)],
          log: isPast
            ? Array.from({ length: 3 }, () => ({ weight: String(benchKg), reps: String(reps), time: "", done: true }))
            : emptyLog(3),
        },
      ],
    };
  });

  // Ordinary (non-RIR) sessions so the calendar reads as a real,
  // continuously-run programme: twice a week from 6 weeks before the
  // block through END_DATE — a Full Body session 3 days after every
  // weekly slot, plus the weekly slot itself outside the block weeks.
  const firstWeek = BLOCK_START_WEEK - 6;
  const plainSessions = [];
  let trapBar = 92.5;
  for (let w = firstWeek; ; w++) {
    const slot = addDaysISO(t, w * 7);
    if (slot > END_DATE) break;
    const inBlock = w >= BLOCK_START_WEEK && w < BLOCK_START_WEEK + BLOCK.length;
    const dates = inBlock ? [addDaysISO(slot, 3)] : [slot, addDaysISO(slot, 3)];
    for (const date of dates) {
      if (date > END_DATE) continue;
      const isPast = date < t;
      if (isPast) trapBar += 1.25;
      const isA = plainSessions.length % 2 === 0;
      plainSessions.push({
        name: isA ? "Full Body A" : "Full Body B",
        date,
        exercises: isA
          ? [
              { name: "Trap Bar Deadlift", sets: 3, reps: "6", rest: "2min",
                log: isPast
                  ? Array.from({ length: 3 }, () => ({ weight: String(roundHalf(trapBar)), reps: "6", time: "", done: true }))
                  : emptyLog(3) },
              { name: "Chin Up", sets: 3, reps: "8", rest: "90s", is_bodyweight: true,
                log: isPast
                  ? Array.from({ length: 3 }, () => ({ weight: "", reps: "8", time: "", done: true }))
                  : emptyLog(3) },
            ]
          : [
              { name: "Dumbbell Walking Lunge", sets: 3, reps: "10", rest: "90s",
                log: isPast
                  ? Array.from({ length: 3 }, () => ({ weight: "16", reps: "10", time: "", done: true }))
                  : emptyLog(3) },
              { name: "Seated Cable Row", sets: 3, reps: "10", rest: "90s",
                log: isPast
                  ? Array.from({ length: 3 }, () => ({ weight: "45", reps: "10", time: "", done: true }))
                  : emptyLog(3) },
            ],
      });
    }
  }

  const allSessions = [...rirBlock, ...plainSessions];
  for (const s of allSessions) {
    const { data: session, error: sessErr } = await sb
      .from("sessions")
      .insert({ athlete_id: athlete.id, name: s.name, date: s.date, type: "strength" })
      .select("id").single();
    if (sessErr) throw sessErr;
    const exRows = s.exercises.map((e, i) => exercisePresc(session.id, i, e));
    const { error: exErr } = await sb.from("session_exercises").insert(exRows);
    if (exErr) throw exErr;
  }

  const origin = (env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  console.log(`\n✓ Seeded "${ATHLETE_NAME}" in "${DEMO_ORG_NAME}" with ${allSessions.length} sessions.`);
  console.log(`  Fixed 1RMs: Back Squat ${SQUAT_1RM}kg, Bench Press ${BENCH_1RM}kg`);
  console.log(`  RIR block (6 weeks):`);
  for (const s of rirBlock) console.log(`    ${s.date}  ${s.name}${s.date < t ? "  (logged)" : s.date === t ? "  ← today, unlogged" : ""}`);
  console.log(`\n  Athlete link: ${origin}/a/${athlete.share_token}`);
  console.log(`  Coach view:   sign in via /demo → Athletes → "${ATHLETE_NAME}"`);
  console.log(`    • open today's "RIR Block W4" session → "Use Target RIR" is ticked on`);
  console.log(`      Back Squat/Bench Press, and the empty weight box shows a greyed suggested kg`);
  console.log(`      computed from her fixed 1RM + the RIR table, with no value typed in yet`);
  console.log(`    • W1-W3 show the same mechanism already logged (8 reps, RIR 3 -> 2 -> 1); W5-W6 are upcoming`);
}

main().catch((e) => {
  console.error("SEED FAILED:", e.message);
  process.exit(1);
});

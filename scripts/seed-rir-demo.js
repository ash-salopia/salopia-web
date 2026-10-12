// Demo data for the Target RIR load-prescription feature (migration
// 0112). Creates ONE new athlete in the "VIS BUILD Demo" org, named
// "<name> (RIR)" so it's obvious which athlete to open (same
// convention as "Marcus Vale (MAS)" / "Rico Alvarez (RTP)"), with a
// fixed 1RM on her two main lifts and a 3-week RIR-stepping block
// (3 RIR -> 2 RIR -> 1 RIR) — the last of the three is upcoming/
// unlogged, so opening it live shows the suggested-kg placeholder
// computed straight from the RIR table (lib/rir-load.ts), the
// headline moment of the feature. A handful of ordinary strength
// sessions bracket that block so her calendar has the same no-gaps-
// through-November coverage as every other demo athlete.
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
// Same reps×RIR table as lib/rir-load.ts (reps 1-12, RIR 0-3), just
// inlined here so the seed script has no dependency on the TS build.
function pctFromRepsRIR(reps, rir) {
  const table = {
    5: [86, 83, 81, 78], // RIR 0,1,2,3
  };
  return table[reps][rir];
}
function suggestedKg(oneRM, reps, rir) {
  const pct = pctFromRepsRIR(reps, rir);
  return Math.round(((oneRM * pct) / 100) * 2) / 2;
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

  // The 3-week RIR-stepping block is the actual feature demo: same
  // prescribed reps (5) each week, target RIR drops 3 -> 2 -> 1 as the
  // block progresses toward its peak, exactly the "autoregulated taper"
  // pattern described when this feature was scoped. The first two are
  // already logged (reps achieved match what was asked); the third is
  // this week's upcoming session, deliberately left unlogged so opening
  // it shows the live suggested-kg placeholder.
  const rirBlock = [3, 2, 1].map((rir, i) => {
    const date = addDaysISO(t, -14 + i * 7); // -14, -7, 0 (today)
    const isPast = date < t;
    const squatKg = suggestedKg(SQUAT_1RM, 5, rir);
    const benchKg = suggestedKg(BENCH_1RM, 5, rir);
    return {
      name: `Lower/Upper — Target RIR ${rir}`,
      date,
      exercises: [
        {
          name: "Barbell Back Squat", sets: 4, reps: "5", rest: "2min30s",
          use_rir: true, set_rir: ["", String(rir), String(rir), String(rir)], // set 1 is a ramp-up, no RIR target
          notes: `Working sets @ ${rir} RIR — bar speed should still look crisp on the last rep.`,
          log: isPast
            ? Array.from({ length: 4 }, (_, si) => ({
                weight: si === 0 ? String(Math.round((squatKg * 0.8) * 2) / 2) : String(squatKg),
                reps: "5", time: "", done: true,
              }))
            : Array.from({ length: 4 }, () => ({ weight: "", reps: "", time: "", done: false })),
        },
        {
          name: "Barbell Bench Press", sets: 3, reps: "5", rest: "2min",
          use_rir: true, set_rir: [String(rir), String(rir), String(rir)],
          log: isPast
            ? Array.from({ length: 3 }, () => ({ weight: String(benchKg), reps: "5", time: "", done: true }))
            : Array.from({ length: 3 }, () => ({ weight: "", reps: "", time: "", done: false })),
        },
      ],
    };
  });

  // A few ordinary (non-RIR) sessions bracketing the block so the
  // calendar reads as a real, continuously-run programme rather than
  // three isolated demo sessions — same no-gaps-through-November bar
  // as every other demo athlete.
  const plainDates = [-28, -21, 7, 14, 21, 28, 35, 42, 49].map((d) => addDaysISO(t, d));
  const plainSessions = plainDates.map((date, i) => {
    const isPast = date < t;
    return {
      name: i % 2 === 0 ? "Full Body A" : "Full Body B",
      date,
      exercises: [
        { name: "Trap Bar Deadlift", sets: 3, reps: "6", rest: "2min",
          log: isPast
            ? Array.from({ length: 3 }, () => ({ weight: "100", reps: "6", time: "", done: true }))
            : Array.from({ length: 3 }, () => ({ weight: "", reps: "", time: "", done: false })) },
        { name: "Chin Up", sets: 3, reps: "8", rest: "90s", is_bodyweight: true,
          log: isPast
            ? Array.from({ length: 3 }, () => ({ weight: "", reps: "8", time: "", done: true }))
            : Array.from({ length: 3 }, () => ({ weight: "", reps: "", time: "", done: false })) },
      ],
    };
  });

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
  console.log(`  RIR block: ${rirBlock.map((s) => `${s.date} (RIR target shown in name)`).join(" | ")}`);
  console.log(`\n  Athlete link: ${origin}/a/${athlete.share_token}`);
  console.log(`  Coach view:   sign in via /demo → Athletes → "${ATHLETE_NAME}"`);
  console.log(`    • open today's "Lower/Upper — Target RIR 1" session → "Use Target RIR" is ticked on`);
  console.log(`      Back Squat/Bench Press, and the empty weight box shows a greyed suggested kg`);
  console.log(`      computed from her fixed 1RM + the RIR table, with no value typed in yet`);
  console.log(`    • the two earlier sessions show the same mechanism already logged, RIR 3 -> 2 -> 1`);
}

main().catch((e) => {
  console.error("SEED FAILED:", e.message);
  process.exit(1);
});

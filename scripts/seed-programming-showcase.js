// Demo data for the programme builder's programming methods (0132 +
// "Modify prescription"). Creates, in the "VIS BUILD Demo" org:
//
//   - six athletes, each named after the method their programme shows
//     ("Tom Reid (5/3/1)", ...), with fixed 1RMs on their main lifts so
//     %1RM prescriptions turn straight into kg for that athlete;
//   - five "Showcase - ..." session templates to build the programmes from.
//
// The programmes themselves are built in the app (Programmes -> Build New
// Programme -> Add from template -> Modify prescription -> Programme
// method -> Load onto athlete) - that's the part worth demoing live.
//
// Safe to re-run: deletes the showcase athletes (their sessions cascade)
// and "Showcase - " templates first, then rebuilds. Leaves every other
// demo athlete, template and programme alone.
//
// Usage: node scripts/seed-programming-showcase.js

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
const TEMPLATE_PREFIX = "Showcase - ";

const ATHLETES = [
  { name: "Tom Reid (5/3/1)", sex: "male", dob: "1996-04-12", bw: 88, group: "Senior Squad",
    rms: { "Barbell Back Squat": 160, "Barbell Bench Press": 110, "Conventional Deadlift": 195, "Barbell Overhead Press": 70 } },
  { name: "Chloe Evans (Block)", sex: "female", dob: "1999-09-03", bw: 66, group: "Senior Squad",
    rms: { "Barbell Back Squat": 115, "Barbell Bench Press": 65, "Conventional Deadlift": 135, "Barbell Overhead Press": 45, "Barbell Front Squat": 95 } },
  { name: "Daniel Hughes (DUP)", sex: "male", dob: "1998-01-22", bw: 82, group: "Senior Squad",
    rms: { "Barbell Back Squat": 145, "Barbell Bench Press": 100, "Romanian Deadlift": 140 } },
  { name: "Hannah Brooks (5x5)", sex: "female", dob: "2003-06-15", bw: 61, group: "Development",
    rms: { "Barbell Back Squat": 80, "Barbell Bench Press": 47.5, "Bent Over Row": 50, "Barbell Overhead Press": 35, "Conventional Deadlift": 100 } },
  { name: "Mia Collins (Hypertrophy)", sex: "female", dob: "1997-11-30", bw: 63, group: "Senior Squad",
    rms: { "Barbell Back Squat": 100, "Hip Thrust": 140 } },
  { name: "Oliver Grant (Youth)", sex: "male", dob: "2010-03-08", bw: 68, group: "Academy U16",
    rms: { "Barbell Back Squat": 100, "Barbell Bench Press": 70, "Conventional Deadlift": 120 } },
];

// Exercise prescription in the shape template_defs.exercises stores.
let n = 0;
function ex(name, sets, reps, extra = {}) {
  n += 1;
  return {
    id: `showcase-${n}-${Math.random().toString(36).slice(2, 8)}`,
    name, order: "", sets, reps: String(reps), time: "", rest: extra.rest ?? "", target_load: extra.kg != null ? String(extra.kg) : "",
    tempo: "", each_side: !!extra.eachSide, notes: extra.notes ?? "", video_url: "",
    is_bodyweight: !!extra.bw, completion_only: !!extra.tick,
    use_percent_1rm: extra.pct != null, set_percents: extra.pct != null ? Array(sets).fill(String(extra.pct)) : [],
    use_rir: false, set_rir: [],
  };
}
const MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5; // JS getDay() - template_defs.days

const TEMPLATES = [
  {
    name: "5/3/1 4-Day",
    defs: [
      { name: "Squat Day", days: [MON], exercises: [ex("Barbell Back Squat", 3, 5, { pct: 70, rest: "3 min" }), ex("Romanian Deadlift", 3, 10, { kg: 80 }), ex("Walking Lunge", 3, 10, { kg: 16, eachSide: true }), ex("Hanging Leg Raise", 3, 12, { bw: true })] },
      { name: "Bench Day", days: [TUE], exercises: [ex("Barbell Bench Press", 3, 5, { pct: 70, rest: "3 min" }), ex("Bent Over Row", 4, 10, { kg: 60 }), ex("Chin Up", 3, 8, { bw: true }), ex("Lateral Raises", 3, 15, { kg: 8 })] },
      { name: "Deadlift Day", days: [THU], exercises: [ex("Conventional Deadlift", 3, 5, { pct: 70, rest: "3 min" }), ex("Bulgarian Split Squat", 3, 8, { kg: 20, eachSide: true }), ex("Hip Thrust", 3, 10, { kg: 100 }), ex("Side Plank", 3, "30s", { bw: true })] },
      { name: "Press Day", days: [FRI], exercises: [ex("Barbell Overhead Press", 3, 5, { pct: 70, rest: "3 min" }), ex("Weighted Pull Up", 3, 6, { kg: 10 }), ex("Incline Dumbbell Press", 3, 10, { kg: 30 }), ex("DB Bicep Curl", 3, 12, { kg: 14 })] },
    ],
  },
  {
    name: "Lower / Upper / Lower",
    defs: [
      { name: "Lower A", days: [MON], exercises: [ex("Barbell Back Squat", 4, 8, { pct: 67.5 }), ex("Romanian Deadlift", 3, 8, { kg: 70 }), ex("Walking Lunge", 3, 10, { kg: 12, eachSide: true }), ex("Deadbugs", 3, 10, { bw: true })] },
      { name: "Upper", days: [WED], exercises: [ex("Barbell Bench Press", 4, 8, { pct: 67.5 }), ex("Barbell Overhead Press", 3, 8, { pct: 65 }), ex("Bent Over Row", 3, 10, { kg: 45 }), ex("Chin Up", 3, 6, { bw: true })] },
      { name: "Lower B", days: [FRI], exercises: [ex("Conventional Deadlift", 4, 6, { pct: 70 }), ex("Barbell Front Squat", 3, 6, { pct: 65 }), ex("Hip Thrust", 3, 10, { kg: 90 }), ex("Side Plank", 3, "30s", { bw: true })] },
    ],
  },
  {
    name: "Full Body 3-Day",
    defs: [
      { name: "Full Body 1", days: [MON], exercises: [ex("Barbell Back Squat", 4, 8, { pct: 70 }), ex("Barbell Bench Press", 4, 8, { pct: 70 }), ex("Bent Over Row", 3, 10, { kg: 60 }), ex("Hanging Leg Raise", 3, 10, { bw: true })] },
      { name: "Full Body 2", days: [WED], exercises: [ex("Barbell Back Squat", 4, 8, { pct: 70 }), ex("Barbell Bench Press", 4, 8, { pct: 70 }), ex("Romanian Deadlift", 3, 8, { pct: 65 }), ex("Lat Pulldown", 3, 10, { kg: 60 })] },
      { name: "Full Body 3", days: [FRI], exercises: [ex("Barbell Back Squat", 4, 8, { pct: 70 }), ex("Barbell Bench Press", 4, 8, { pct: 70 }), ex("Chin Up", 3, 8, { bw: true }), ex("Farmers Carry", 3, "20m", { kg: 32 })] },
    ],
  },
  {
    name: "5x5 A/B",
    defs: [
      { name: "Workout A", days: [MON, FRI], exercises: [ex("Barbell Back Squat", 5, 5, { pct: 70 }), ex("Barbell Bench Press", 5, 5, { pct: 70 }), ex("Bent Over Row", 5, 5, { pct: 70 })] },
      { name: "Workout B", days: [WED], exercises: [ex("Barbell Back Squat", 5, 5, { pct: 70 }), ex("Barbell Overhead Press", 5, 5, { pct: 70 }), ex("Conventional Deadlift", 1, 5, { pct: 75 })] },
    ],
  },
  {
    name: "Upper / Lower Hypertrophy",
    defs: [
      { name: "Upper Hypertrophy", days: [MON, THU], exercises: [ex("DB Bench Press", 3, 8, { kg: 24 }), ex("DB Incline Row", 3, 8, { kg: 22 }), ex("DB Shoulder Press", 3, 8, { kg: 16 }), ex("Lat Pulldown", 3, 10, { kg: 45 }), ex("DB Bicep Curl", 3, 10, { kg: 10 })] },
      { name: "Lower Hypertrophy", days: [TUE, FRI], exercises: [ex("Barbell Back Squat", 3, 8, { pct: 70 }), ex("Hip Thrust", 3, 8, { pct: 70 }), ex("Bulgarian Split Squat", 3, 8, { kg: 14, eachSide: true }), ex("Walking Lunge", 2, 12, { kg: 10, eachSide: true })] },
    ],
  },
  {
    name: "Youth Strength & Power",
    defs: [
      { name: "Strength & Power A", days: [MON], exercises: [ex("Box Jump", 3, 5, { tick: true, notes: "Step down, full reset each rep" }), ex("Barbell Back Squat", 3, 5, { pct: 75 }), ex("Barbell Bench Press", 3, 5, { pct: 75 }), ex("Chin Up", 3, 6, { bw: true }), ex("Side Plank", 3, "30s", { bw: true })] },
      { name: "Strength & Power B", days: [THU], exercises: [ex("Broad Jump", 3, 5, { tick: true }), ex("Conventional Deadlift", 3, 5, { pct: 75 }), ex("Barbell Overhead Press", 3, 8, { kg: 30 }), ex("Bulgarian Split Squat", 3, 8, { kg: 10, eachSide: true }), ex("Med Ball Rotational Throw", 3, 6, { tick: true, eachSide: true })] },
    ],
  },
];

async function main() {
  const { data: org, error: orgErr } = await sb.from("organisations").select("id").eq("name", DEMO_ORG_NAME).single();
  if (orgErr || !org) throw new Error(`No "${DEMO_ORG_NAME}" org found - run scripts/seed-demo-org.js first.`);

  // Athletes
  const names = ATHLETES.map((a) => a.name);
  const { data: old } = await sb.from("athletes").select("id, name").eq("organisation_id", org.id).in("name", names);
  if (old?.length) {
    // Programme assignments go with them (cascade); programmes stay.
    const { error } = await sb.from("athletes").delete().in("id", old.map((a) => a.id));
    if (error) throw error;
    console.log(`Removed ${old.length} existing showcase athlete(s).`);
  }
  for (const a of ATHLETES) {
    const { data: row, error } = await sb
      .from("athletes")
      .insert({ organisation_id: org.id, name: a.name, group: a.group, sex: a.sex, date_of_birth: a.dob, bodyweight_kg: a.bw })
      .select("id")
      .single();
    if (error) throw error;
    const { error: rmErr } = await sb.from("athlete_one_rms").insert(
      Object.entries(a.rms).map(([exercise_name, one_rm_kg]) => ({ athlete_id: row.id, exercise_name, one_rm_kg }))
    );
    if (rmErr) throw rmErr;
    console.log(`Added ${a.name} (${Object.keys(a.rms).length} 1RMs).`);
  }

  // Templates
  const { data: oldT } = await sb.from("templates").select("id").eq("organisation_id", org.id).like("name", `${TEMPLATE_PREFIX}%`);
  if (oldT?.length) {
    const { error } = await sb.from("templates").delete().in("id", oldT.map((t) => t.id));
    if (error) throw error;
    console.log(`Removed ${oldT.length} existing showcase template(s).`);
  }
  for (const t of TEMPLATES) {
    const { data: tpl, error } = await sb.from("templates").insert({ organisation_id: org.id, name: TEMPLATE_PREFIX + t.name }).select("id").single();
    if (error) throw error;
    const { error: dErr } = await sb.from("template_defs").insert(
      t.defs.map((d, i) => ({ template_id: tpl.id, name: d.name, type: "strength", days: d.days, exercises: d.exercises, sort_order: i, notes: "" }))
    );
    if (dErr) throw dErr;
    console.log(`Added template "${TEMPLATE_PREFIX}${t.name}" (${t.defs.length} sessions).`);
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

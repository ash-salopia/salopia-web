// Additive demo data for features that aren't pushed yet — daily
// check-ins (0079), 1:1 direct messages (0077) and VBT velocity
// profiles (0078). Unlike scripts/seed-demo-org.js this does NOT wipe
// or rebuild anything: it tops up the existing "VIS BUILD Demo" org's
// athletes with rows for these three tables so the new dashboard
// panels / profile sections / athlete-link surfaces have something
// real to show.
//
// Safe to re-run: each section first deletes the rows it owns for the
// demo org's athletes, then re-inserts, so you always get the same
// fixed shape rather than duplicates piling up.
//
// Usage: node scripts/seed-demo-feature-data.js
//
// Requires 0077/0078/0079 to have been applied to the linked DB. If
// checkins / athlete_velocity_profiles don't exist yet the script
// seeds whatever it can and tells you what it skipped.

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

// ── Date helpers (Europe/London, matching lib/date-utils) ─────────────────────

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}
function addDaysISO(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// hoursAgo -> ISO timestamp, for created_at on messages
function agoISO({ days = 0, hours = 0, minutes = 0 }) {
  return new Date(Date.now() - ((days * 24 + hours) * 60 + minutes) * 60_000).toISOString();
}

// ── Least-squares linear fit (ported verbatim from lib/velocity-profile.ts) ───

function fitLinearRegression(points) {
  const valid = points.filter((p) => isFinite(p.load) && isFinite(p.velocity));
  const distinctLoads = new Set(valid.map((p) => p.load));
  if (valid.length < 2 || distinctLoads.size < 2) return null;

  const n = valid.length;
  const meanX = valid.reduce((s, p) => s + p.load, 0) / n;
  const meanY = valid.reduce((s, p) => s + p.velocity, 0) / n;

  let sxy = 0;
  let sxx = 0;
  for (const p of valid) {
    sxy += (p.load - meanX) * (p.velocity - meanY);
    sxx += (p.load - meanX) ** 2;
  }
  if (sxx === 0) return null;

  const slope = sxy / sxx;
  return { slope, intercept: meanY - slope * meanX };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

// Today's check-ins — a deliberate spread so the dashboard's "Poor
// check-ins today" panel (energy<=2 / sleep<=2 / soreness>=4) has a
// mix: two athletes flagged multiple ways, one clean "feeling great",
// one high-volume-only (deliberately NOT a dashboard flag), and a
// couple with no check-in at all (partial completion is realistic).
const TODAY_CHECKINS = {
  "Jake Morrison":   { energy: 2, sleep: 2, soreness: 3, volume: 4 }, // Low energy + Poor sleep
  "Sophie Bennett":  { energy: 4, sleep: 2, soreness: 4, volume: 3 }, // Poor sleep + High soreness
  "Ava Thompson":    { energy: 3, sleep: 3, soreness: 5, volume: 4 }, // High soreness
  "Grace Mitchell":  { energy: 5, sleep: 4, soreness: 1, volume: 2 }, // clean — "feeling great"
  "Ethan Wright":    { energy: 3, sleep: 4, soreness: 2, volume: 5 }, // high volume only
  "Noah Patel":      { energy: 4, sleep: 3, soreness: 2, volume: 3 }, // fine
};

// Athletes who also have a few days of prior check-in history, so any
// future history view has a trend to draw. Deterministic, not random.
const HISTORY_ATHLETES = ["Jake Morrison", "Sophie Bennett", "Ava Thompson", "Grace Mitchell", "Ethan Wright"];
const HISTORY_DAYS = 6;

function historicCheckIn(name, dayOffset) {
  // Simple deterministic hash so re-runs produce identical rows.
  let h = 0;
  const key = `${name}:${dayOffset}`;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const pick = (lo, hi) => lo + ((h = (h * 1103515245 + 12345) >>> 0) % (hi - lo + 1));
  return { energy: pick(2, 5), sleep: pick(2, 5), soreness: pick(1, 4), volume: pick(2, 5) };
}

// Direct-message threads. `from` is "athlete" or "coach"; `ago` feeds
// agoISO(). Ordered oldest-first per athlete.
const MESSAGE_THREADS = {
  "Jake Morrison": [
    { from: "athlete", ago: { days: 2, hours: 3 }, body: "Shoulder's still bugging me on bench, might need to go lighter Thursday" },
    { from: "coach",   ago: { days: 2, hours: 2 }, body: "No worries — drop to 3x8 at RPE 7 and we'll reassess next week" },
    { from: "athlete", ago: { days: 2, hours: 1 }, body: "Sounds good 👍" },
    { from: "athlete", ago: { hours: 2 },          body: "Gym was rammed today, only got through the main lifts" },
  ],
  "Sophie Bennett": [
    { from: "coach",   ago: { days: 1, hours: 4 }, body: "Squat looked really fast on the video yesterday, nice work" },
    { from: "athlete", ago: { hours: 5 },          body: "", audio: { path: "chat-audio/demo-voice-note-sophie.webm", seconds: 12 } },
  ],
  "Ava Thompson": [
    { from: "athlete", ago: { hours: 6 },          body: "Can we move my Friday session to Saturday? Got a match" },
    { from: "coach",   ago: { hours: 5 },          body: "Done — moved it to Sat 10am" },
    { from: "athlete", ago: { hours: 4, minutes: 30 }, body: "Perfect, thank you!" },
  ],
  "Noah Patel": [
    { from: "athlete", ago: { days: 1, hours: 2 }, body: "New PB on deadlift today!! 🎉" },
    { from: "coach",   ago: { days: 1, hours: 1 }, body: "Massive. That's +10kg in a block 💪" },
  ],
};

// VBT velocity profiles: a handful of (load, velocity) test reps per
// exercise. slope/intercept are fitted here (never trusted from a
// caller) exactly like lib/data/velocity-profiles.ts does on save.
const VELOCITY_PROFILES = {
  "Marcus Webb (VBT)": [
    { exercise: "Barbell Back Squat", mvt: 0.30, points: [ { load: 70, velocity: 1.02 }, { load: 90, velocity: 0.80 }, { load: 110, velocity: 0.58 }, { load: 130, velocity: 0.37 } ] },
    { exercise: "Barbell Bench Press", mvt: 0.17, points: [ { load: 45, velocity: 0.92 }, { load: 55, velocity: 0.74 }, { load: 65, velocity: 0.55 }, { load: 75, velocity: 0.39 } ] },
  ],
  "Jake Morrison": [
    { exercise: "Barbell Back Squat", mvt: 0.30, points: [ { load: 60, velocity: 0.98 }, { load: 80, velocity: 0.79 }, { load: 100, velocity: 0.56 }, { load: 120, velocity: 0.34 } ] },
  ],
};

// ── Testing history ─────────────────────────────────────────────────────────
// This owns ALL of the demo org's testing data — it wipes every existing
// test session for the demo athletes and rebuilds a rich ~9-month
// history so the Test Report, the group Squad Summary and the new
// "compare to previous / best / first" options all have something
// detailed to show a prospective coach.

// Youth-realistic DOBs. The demo's cloned Elite Youth / General
// Population norms only cover ages 8–18, so anyone older shows "N/A"
// for every rating and the personalised commentary section stays
// empty. Pulling the four over-18s into the band is what makes the
// reports actually demo well. (Ava / Ethan / Liam / Noah are already
// youth-aged and left alone.)
const TESTING_DOB = {
  "Jake Morrison":     "2008-03-14", // ~18
  "Sophie Bennett":    "2008-11-02", // ~17
  "Grace Mitchell":    "2009-05-17", // ~17
  "Marcus Webb (VBT)": "2008-04-12", // ~18
};

// Per-athlete testing profile.
//   level — shifts every metric toward a RAG band (+ = stronger), so
//           each report shows a spread of Excellent → Needs Work rather
//           than all one colour.
//   trend — shape of the 6-session progression:
//           improver | fast | plateau | late_bloom | recent_dip
//           recent_dip: peaks mid-block, dips at the 5th test, partly
//           recovers at the 6th — so "vs previous", "vs best previous"
//           and "vs first" all land on genuinely different numbers.
//   asym  — Single Leg CMJ left/right imbalance (fraction). >0.15 reads
//           as a clinical-concern flag, 0.10–0.15 as "monitor".
//   asymEase — how much the imbalance shrinks from first test to last
//           (0 = unchanged, 1 = fully resolved). Default 0.4.
const TESTING_PROFILES = {
  "Jake Morrison":     { level: 0.11,  trend: "fast",       asym: 0.05 },
  "Sophie Bennett":    { level: 0.05,  trend: "improver",   asym: 0.07 },
  "Ava Thompson":      { level: -0.02, trend: "recent_dip", asym: 0.15, asymEase: 0.28 },
  "Grace Mitchell":    { level: 0.01,  trend: "plateau",    asym: 0.04 },
  "Ethan Wright":      { level: -0.11, trend: "late_bloom", asym: 0.19, asymEase: 0.15 },
  "Liam O'Connor":     { level: 0.03,  trend: "improver",   asym: 0.06 },
  "Noah Patel":        { level: -0.07, trend: "improver",   asym: 0.09 },
  "Marcus Webb (VBT)": { level: 0.08,  trend: "plateau",    asym: 0.05 },
};

const GROUP_MEMBERS = new Set(["Jake Morrison", "Sophie Bennett", "Ava Thompson", "Grace Mitchell", "Ethan Wright"]);
const TEST_OFFSETS = [-262, -190, -128, -74, -32]; // 5 individual sessions
const GROUP_OFFSET = -6;                            // 6th = the squad testing day
const TEST_NOTES = ["", "End of pre-season testing block.", "", "Mid-season check — training load has been high.", "", "Return-to-play screen after a minor ankle niggle."];

// Metric model: a mid-ability ~16yo male anchor, how spread the metric
// is (for level + a fixed per-athlete offset), a female adjustment, and
// display precision. better_direction comes from the metric row itself.
const METRIC_MODEL = {
  "10m Sprint":                     { base: 1.88, spread: 0.13, sexF: +0.06, dp: 2, trials: 3 },
  "Countermovement Jump":           { base: 33,   spread: 6,    sexF: -5,    dp: 1, trials: 3 },
  "Squat Jump":                     { base: 29,   spread: 5,    sexF: -4,    dp: 1, trials: 3 },
  "Reactive Strength Index (10-5)": { base: 1.55, spread: 0.42, sexF: -0.2,  dp: 2, trials: 3 },
  "IMTP Peak Force (kg)":           { base: 145,  spread: 42,   sexF: -35,   dp: 0, trials: 2 },
  "IMTP Relative (N/kg)":           { base: 24,   spread: 5.5,  sexF: -3,    dp: 1, trials: 2 },
  "505 Change of Direction":        { base: 2.48, spread: 0.20, sexF: +0.09, dp: 2, trials: 3 },
  "Anterior Hold":                  { base: 68,   spread: 26,   sexF: -6,    dp: 0, trials: 2 },
  "Side Plank":                     { base: 62,   spread: 24,   sexF: -4,    dp: 0, trials: 2 },
  "Grip Strength":                  { base: 37,   spread: 11,   sexF: -10,   dp: 0, trials: 2 },
  "Single Leg CMJ":                 { base: 16,   spread: 3.2,  sexF: -2.5,  dp: 1, trials: 2 },
};

function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function ageOn(dob, onISO) {
  const b = new Date(dob + "T00:00:00Z"), o = new Date(onISO + "T00:00:00Z");
  let age = o.getUTCFullYear() - b.getUTCFullYear();
  if (o.getUTCMonth() < b.getUTCMonth() || (o.getUTCMonth() === b.getUTCMonth() && o.getUTCDate() < b.getUTCDate())) age--;
  return age;
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const roundTo = (v, dp) => Number(v.toFixed(dp));

// ── Recent-session logging ──────────────────────────────────────────────────
// A demo athlete's most recent strength sessions are seeded as "upcoming"
// (exercises prescribed, nothing ticked done). We fill 1–2 of them with a
// realistic progression story vs the previous same-exercise session so
// "open a recent session → AI Report" shows the best-set / total-load
// signals the coach sees in Live Group.
const LOG_ATHLETES = ["Jake Morrison", "Sophie Bennett"];

const numOrNull = (s) => { const n = parseFloat(s); return isFinite(n) ? n : null; };
const firstInt = (s) => { const m = String(s ?? "").match(/\d+/); return m ? parseInt(m[0], 10) : null; };

// Build a completed `log` array for `ex` that reads as progress (or, for
// bench press, a small regression) against `prevEx`.
function progressedLog(ex, prevEx) {
  const nSets = (ex.log ?? []).length || firstInt(ex.sets) || 3;
  const timeMode = (ex.time ?? "").trim().length > 0;
  const done = (prevEx?.log ?? []).filter((l) => l.done);
  const prevW = done.map((l) => numOrNull(l.weight)).filter((v) => v != null);
  const prevR = done.map((l) => firstInt(l.reps)).filter((v) => v != null);
  const prescReps = firstInt(ex.reps) ?? 8;

  // time-mode holds or nothing to build from → just mark the sets done
  if (timeMode || (!prevW.length && !prevR.length)) {
    return Array.from({ length: nSets }, () => ({ weight: "", reps: "", time: ex.time || "", done: true }));
  }

  // weighted
  if (prevW.length) {
    const top = Math.max(...prevW);
    const reps = prevR.length ? Math.round(prevR.reduce((a, b) => a + b, 0) / prevR.length) : (firstInt(ex.reps) || 6);

    if (/bench press/i.test(ex.name)) {
      // regression: -2.5kg, last set lighter and a rep short
      return Array.from({ length: nSets }, (_, i) =>
        i === nSets - 1
          ? { weight: String(top - 5), reps: String(Math.max(1, reps - 1)), time: "", done: true }
          : { weight: String(top - 2.5), reps: String(reps), time: "", done: true }
      );
    }
    if (/back squat|^squat/i.test(ex.name)) {
      // best set up +2.5kg, but a rep short on the last set → total load
      // roughly flat/slightly down. The clearest "two axes" teaching case.
      return Array.from({ length: nSets }, (_, i) => ({
        weight: String(top + 2.5),
        reps: String(i === nSets - 1 ? Math.max(1, reps - 1) : reps),
        time: "", done: true,
      }));
    }
    // clean progression: +2.5kg, full reps
    return Array.from({ length: nSets }, () => ({ weight: String(top + 2.5), reps: String(reps), time: "", done: true }));
  }

  // bodyweight + reps (chin up, leg raise): +1 rep on the top set
  const topR = prevR.length ? Math.max(...prevR) : prescReps;
  return Array.from({ length: nSets }, (_, i) => ({
    weight: "", reps: String(i === 0 ? topR + 1 : topR), time: "", done: true,
  }));
}

// One trial value for (athlete, metric, session, trial). Deterministic
// so re-running the script reproduces the exact same history.
function trialValue({ metric, model, profile, athlete, date, sessionIdx, totalSessions, trial }) {
  const lower = metric.better_direction === "lower";
  const rnd = mulberry32(hashStr(`${athlete.id}|${metric.id}|${sessionIdx}|${trial}`));
  const off = mulberry32(hashStr(`${athlete.id}|${metric.id}|off`))();

  const maturity = clamp((ageOn(athlete.date_of_birth, date) - 12) / 6, 0.15, 1.05);
  const sexAdj = athlete.sex === "female" ? model.sexF : 0;

  let base = (model.base + sexAdj) * (0.78 + 0.30 * maturity);
  base *= 1 + (lower ? -profile.level : profile.level);
  base += (off - 0.5) * model.spread;                 // fixed per-athlete-metric offset

  const p = totalSessions <= 1 ? 1 : sessionIdx / (totalSessions - 1);
  let tr;
  switch (profile.trend) {
    case "fast":       tr = 0.13 * p; break;
    case "improver":   tr = 0.07 * p; break;
    case "plateau":    tr = 0.015 * p; break;
    case "late_bloom": tr = p < 0.66 ? 0.012 * p : 0.008 + 0.11 * ((p - 0.66) / 0.34); break;
    case "recent_dip": tr = [0, 0.030, 0.055, 0.085, 0.035, 0.065][Math.min(sessionIdx, 5)]; break;
    default:           tr = 0.05 * p;
  }
  let v = lower ? base / (1 + tr) : base * (1 + tr);
  v *= 1 + (rnd() - 0.5) * 0.036;                     // within-session trial noise ±1.8%
  return roundTo(v, model.dp);
}

// ── Run ──────────────────────────────────────────────────────────────────────

async function tableExists(name) {
  const { error } = await sb.from(name).select("id").limit(1);
  return !error;
}

async function main() {
  const { data: org, error: orgErr } = await sb
    .from("organisations")
    .select("id")
    .eq("name", DEMO_ORG_NAME)
    .maybeSingle();
  if (orgErr) throw orgErr;
  if (!org) {
    console.error(`No "${DEMO_ORG_NAME}" org found — run scripts/seed-demo-org.js first.`);
    process.exit(1);
  }

  const { data: coaches } = await sb.from("coaches").select("id, name").eq("organisation_id", org.id).order("role");
  const coach = coaches?.[0];
  if (!coach) {
    console.error("Demo org has no coach — run scripts/seed-demo-org.js first.");
    process.exit(1);
  }

  const { data: athleteRows } = await sb
    .from("athletes")
    .select("id, name")
    .eq("organisation_id", org.id)
    .eq("archived", false);
  const idByName = new Map((athleteRows ?? []).map((a) => [a.name, a.id]));
  const resolve = (name) => {
    const id = idByName.get(name);
    if (!id) console.warn(`  · skipped "${name}" (no such athlete in demo org)`);
    return id;
  };
  const allAthleteIds = (athleteRows ?? []).map((a) => a.id);

  const haveCheckins = await tableExists("checkins");
  const haveVelocity = await tableExists("athlete_velocity_profiles");
  const haveGroupTesting = await tableExists("group_test_sessions");

  // ── Check-ins ──────────────────────────────────────────────────────────────
  if (!haveCheckins) {
    console.log("checkins table not found — skipping check-in seed (apply migration 0079 first).");
  } else {
    const today = todayISO();
    const since = addDaysISO(today, -HISTORY_DAYS);
    await sb.from("checkins").delete().in("athlete_id", allAthleteIds).gte("date", since);

    const rows = [];
    for (const [name, answers] of Object.entries(TODAY_CHECKINS)) {
      const id = resolve(name);
      if (id) rows.push({ athlete_id: id, date: today, ...answers });
    }
    for (const name of HISTORY_ATHLETES) {
      const id = resolve(name);
      if (!id) continue;
      for (let d = 1; d <= HISTORY_DAYS; d++) {
        rows.push({ athlete_id: id, date: addDaysISO(today, -d), ...historicCheckIn(name, d) });
      }
    }
    const { error } = await sb.from("checkins").insert(rows);
    if (error) throw error;
    console.log(`Seeded ${rows.length} check-ins (${Object.keys(TODAY_CHECKINS).length} for today).`);
  }

  // ── Direct messages ────────────────────────────────────────────────────────
  {
    await sb.from("direct_messages").delete().in("athlete_id", allAthleteIds);

    const rows = [];
    for (const [name, thread] of Object.entries(MESSAGE_THREADS)) {
      const athleteId = resolve(name);
      if (!athleteId) continue;
      for (const m of thread) {
        const isCoach = m.from === "coach";
        rows.push({
          organisation_id: org.id,
          athlete_id: athleteId,
          sender_type: m.from,
          sender_id: isCoach ? coach.id : athleteId,
          sender_name: isCoach ? coach.name : name,
          body: m.body ?? "",
          audio_path: m.audio?.path ?? null,
          audio_duration_seconds: m.audio?.seconds ?? null,
          created_at: agoISO(m.ago),
        });
      }
    }
    const { error } = await sb.from("direct_messages").insert(rows);
    if (error) throw error;
    console.log(`Seeded ${rows.length} direct messages across ${Object.keys(MESSAGE_THREADS).length} threads.`);
  }

  // ── Velocity profiles ──────────────────────────────────────────────────────
  if (!haveVelocity) {
    console.log("athlete_velocity_profiles table not found — skipping velocity seed (apply migration 0078 first).");
  } else {
    const targetIds = Object.keys(VELOCITY_PROFILES).map((n) => idByName.get(n)).filter(Boolean);
    await sb.from("athlete_velocity_profiles").delete().in("athlete_id", targetIds);

    const rows = [];
    for (const [name, profiles] of Object.entries(VELOCITY_PROFILES)) {
      const athleteId = resolve(name);
      if (!athleteId) continue;
      for (const p of profiles) {
        const fit = fitLinearRegression(p.points);
        if (!fit) { console.warn(`  · ${name} / ${p.exercise}: points don't fit a line, skipped`); continue; }
        rows.push({
          athlete_id: athleteId,
          exercise_name: p.exercise,
          mvt: p.mvt,
          calibration_points: p.points,
          slope: fit.slope,
          intercept: fit.intercept,
          updated_at: new Date().toISOString(),
        });
      }
    }
    const { error } = await sb.from("athlete_velocity_profiles").insert(rows);
    if (error) throw error;
    console.log(`Seeded ${rows.length} velocity profiles.`);
  }

  // ── Testing history + group session ────────────────────────────────────────
  {
    const { data: battery } = await sb
      .from("test_batteries")
      .select("id, name, test_battery_metrics(sort_order, test_metrics(id, name, unit, better_direction, is_bilateral, screening_only))")
      .eq("organisation_id", org.id)
      .order("name")
      .limit(1)
      .maybeSingle();

    if (!battery) {
      console.log("No test battery in demo org — skipping testing seed (run scripts/seed-demo-org.js).");
    } else {
      const metrics = (battery.test_battery_metrics ?? [])
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((bm) => bm.test_metrics)
        .filter((m) => m && METRIC_MODEL[m.name]);

      // Youth-realistic DOBs so benchmark ratings render.
      for (const [name, dob] of Object.entries(TESTING_DOB)) {
        const id = idByName.get(name);
        if (id) await sb.from("athletes").update({ date_of_birth: dob }).eq("id", id);
      }

      // This section owns all demo testing data — wipe every existing
      // test session for the demo athletes (test_results + group
      // sessions cascade / unlink) and rebuild.
      const { data: oldSessions } = await sb.from("test_sessions").select("id").in("athlete_id", allAthleteIds);
      const oldIds = (oldSessions ?? []).map((s) => s.id);
      if (oldIds.length) {
        await sb.from("test_results").delete().in("test_session_id", oldIds);
        await sb.from("test_sessions").delete().in("id", oldIds);
      }
      if (haveGroupTesting) await sb.from("group_test_sessions").delete().eq("organisation_id", org.id);

      const today = todayISO();
      const gDate = addDaysISO(today, GROUP_OFFSET);
      let gts = null;
      if (haveGroupTesting) {
        const { data, error: gErr } = await sb
          .from("group_test_sessions")
          .insert({ organisation_id: org.id, name: `Squad Testing — ${gDate}`, test_battery_id: battery.id, date: gDate })
          .select()
          .single();
        if (gErr) throw gErr;
        gts = data;
      } else {
        console.log("group_test_sessions table not found — seeding individual histories only (apply migration 0080 for the group session).");
      }

      const { data: profiledAthletes } = await sb
        .from("athletes")
        .select("id, name, sex, date_of_birth, bodyweight_kg")
        .in("id", Object.keys(TESTING_PROFILES).map((n) => idByName.get(n)).filter(Boolean));
      const athByName = new Map((profiledAthletes ?? []).map((a) => [a.name, a]));

      // A couple of athletes leave the squad testing day part-finished —
      // shows the report handling sparse data.
      const GROUP_SKIP = {
        "Grace Mitchell": new Set(["IMTP Peak Force (kg)", "IMTP Relative (N/kg)", "Grip Strength"]),
        "Ethan Wright": new Set(["Anterior Hold"]),
      };

      let sessionCount = 0;
      const resultRows = [];
      const lastDateByAthlete = {};

      for (const [name, profile] of Object.entries(TESTING_PROFILES)) {
        const athlete = athByName.get(name);
        if (!athlete) { console.warn(`  · ${name}: not in demo org, skipped`); continue; }

        const inGroup = gts && GROUP_MEMBERS.has(name);
        const offsets = inGroup ? [...TEST_OFFSETS, GROUP_OFFSET] : TEST_OFFSETS;
        const total = offsets.length;

        for (let si = 0; si < offsets.length; si++) {
          const off = offsets[si];
          const isGroupDay = inGroup && off === GROUP_OFFSET;
          const date = addDaysISO(today, off);
          lastDateByAthlete[athlete.id] = date;

          // Bodyweight drifts up a little over the ~9 months.
          const bwDrift = mulberry32(hashStr(`${athlete.id}|bw|${si}`))();
          const bw = roundTo((athlete.bodyweight_kg ?? 65) + si * 0.7 + (bwDrift - 0.5) * 1.2, 1);

          const { data: sess, error: sErr } = await sb
            .from("test_sessions")
            .insert({
              athlete_id: athlete.id,
              test_battery_id: battery.id,
              date,
              bodyweight_kg: bw,
              notes: isGroupDay ? "Full squad testing day." : (TEST_NOTES[si] ?? ""),
              group_test_session_id: isGroupDay ? gts.id : null,
            })
            .select("id")
            .single();
          if (sErr) throw sErr;
          sessionCount++;

          const skip = isGroupDay ? (GROUP_SKIP[name] ?? new Set()) : new Set();
          for (const metric of metrics) {
            if (skip.has(metric.name)) continue;
            const model = METRIC_MODEL[metric.name];
            const sides = metric.is_bilateral ? ["left", "right"] : [null];
            for (const side of sides) {
              for (let trial = 1; trial <= model.trials; trial++) {
                let v = trialValue({ metric, model, profile, athlete, date, sessionIdx: si, totalSessions: total, trial });
                if (side === "right") {
                  // Right side is the weaker limb. Screening (SL CMJ) carries
                  // the full imbalance; 505 only a fraction. The imbalance
                  // eases across the block (rehab / prehab story).
                  const ease = 1 - (profile.asymEase ?? 0.4) * (total <= 1 ? 1 : si / (total - 1));
                  const af = (metric.screening_only ? profile.asym : profile.asym * 0.22) * ease;
                  v = roundTo(metric.better_direction === "lower" ? v * (1 + af) : v * (1 - af), model.dp);
                }
                resultRows.push({ test_session_id: sess.id, test_metric_id: metric.id, side, trial_number: trial, value: v });
              }
            }
          }
        }
      }

      // Chunked insert.
      for (let i = 0; i < resultRows.length; i += 500) {
        const { error } = await sb.from("test_results").insert(resultRows.slice(i, i + 500));
        if (error) throw error;
      }

      // Wire up the dashboard "tests due" clock: squad-day athletes are
      // freshly tested (not due); the three who missed it are overdue, so
      // the dashboard panel has something to show.
      const memberIds = new Set([...GROUP_MEMBERS].map((n) => idByName.get(n)));
      for (const [athleteId, date] of Object.entries(lastDateByAthlete)) {
        await sb.from("athletes")
          .update({ last_test_date: date, retest_weeks: memberIds.has(athleteId) ? 12 : 4 })
          .eq("id", athleteId);
      }

      console.log(
        `Seeded ${sessionCount} test sessions (${resultRows.length} trial values) across ${athByName.size} athletes` +
        (gts ? `, plus the "Squad Testing — ${gDate}" group session (${GROUP_MEMBERS.size} athletes).` : ".")
      );
    }
  }

  // ── Log recent strength sessions (for the "Progress vs last time" demo) ────
  {
    const today = todayISO();
    const logged = [];

    for (const name of LOG_ATHLETES) {
      const athleteId = idByName.get(name);
      if (!athleteId) continue;

      const { data: strength } = await sb
        .from("sessions")
        .select("id, date, name, session_exercises(id, name, sets, reps, log, sort_order, is_bodyweight, time)")
        .eq("athlete_id", athleteId)
        .eq("type", "strength")
        .lt("date", today)
        .order("date", { ascending: false });

      const lu = (strength ?? []).filter((s) => /lower \+ upper/i.test(s.name));
      const hasDone = (s) => (s.session_exercises ?? []).some((e) => (e.log ?? []).some((l) => l.done));

      // The 2 most recent "Lower + Upper" sessions that aren't logged yet.
      const targets = lu.filter((s) => !hasDone(s)).slice(0, 2);

      for (const target of targets) {
        const prevSession = lu.find((s) => s.name === target.name && s.date < target.date && hasDone(s));
        const prevByName = new Map(
          (prevSession?.session_exercises ?? []).map((e) => [e.name.trim().toLowerCase(), e])
        );

        for (const ex of target.session_exercises ?? []) {
          const prev = prevByName.get(ex.name.trim().toLowerCase()) ?? null;
          const patch = { log: progressedLog(ex, prev) };
          if (/bench press/i.test(ex.name)) {
            patch.session_notes = "Left shoulder tight on bench again this week — eased off the load on the last set.";
          }
          await sb.from("session_exercises").update(patch).eq("id", ex.id);
        }
        logged.push(`${name} · ${target.date} "${target.name}"`);
      }
    }

    if (logged.length) {
      console.log(`\nLogged ${logged.length} recent sessions for the "Progress vs last time" view:`);
      for (const l of logged) console.log(`  ${l}`);
    } else {
      console.log("\nNo unlogged recent 'Lower + Upper' sessions found to fill (re-run scripts/seed-demo-org.js if needed).");
    }
  }

  console.log("\nDone. Sign in via /demo — dashboard panels, profile sections, Testing, and session Progress-vs-last-time.");
}

main().catch((e) => {
  console.error("SEED FAILED:", e.message);
  process.exit(1);
});

// Keeps the demo org looking "live": logs every strength session that
// has slipped into the past without being logged, for the prospect-facing
// demo athletes (the 7 base athletes + Marcus Webb (VBT)) - strength
// sessions plus their cardio, hybrid and power/speed sessions.
//
// Why: seed-demo-fill-gaps.js only logs a session if it's already in the
// past when it's inserted - everything it scheduled ahead stays unlogged
// as the dates pass, so a few weeks later the dashboard, compliance and
// reports show the whole squad as having missed a month of training.
//
// For each unlogged past session: every set done at the prescribed reps,
// weight continuing that athlete's own last logged weight for the
// exercise (+2.5kg now and then) - or their %1RM target
// when the session prescribes one - a session RPE of 6-8, and a weight PB
// whenever a lift beats their previous best. About 1 in 12 sessions is
// left unlogged on purpose so compliance reads like a real squad, not 100%.
// Deterministic (no randomness), so re-running gives the same result;
// only ever fills sessions that have no logged sets yet.
//
// Marcus Vale (MAS), Rico Alvarez (RTP) and Priya Anand (RIR) aren't
// touched - re-run their own scripts, which rebuild relative to today.
//
// Usage: node scripts/seed-demo-log-past.js
//        DRY_RUN=1 node scripts/seed-demo-log-past.js   (report only, no writes)

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
const ATHLETES = ["Ava Thompson", "Ethan Wright", "Grace Mitchell", "Jake Morrison", "Liam O'Connor", "Noah Patel", "Sophie Bennett", "Marcus Webb (VBT)"];
const DRY_RUN = process.env.DRY_RUN === "1";

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}
const roundToPlate = (kg) => Math.round(kg / 2.5) * 2.5;
// Small stable hash, so "which sessions are missed" and RPEs don't change between runs.
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}
const firstNum = (s) => {
  const m = String(s ?? "").match(/\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};
// Lander e1RM, the app's default formula.
const e1rm = (w, r) => (r <= 1 ? w : (100 * w) / (101.3 - 2.67123 * r));

async function athleteRun(orgId, name, today) {
  const { data: athlete } = await sb.from("athletes").select("id").eq("organisation_id", orgId).eq("name", name).maybeSingle();
  if (!athlete) return `${name}: not found, skipped`;

  const { data: sessions, error } = await sb
    .from("sessions")
    .select("id, date, type, name, rpe, cardio_config, hyrox_config, session_exercises(id, name, sets, reps, time, target_load, is_bodyweight, completion_only, use_percent_1rm, set_percents, track_velocity, target_velocity, log, sort_order)")
    .eq("athlete_id", athlete.id)
    .lt("date", today)
    .order("date");
  if (error) throw error;
  const { data: fixed } = await sb.from("athlete_one_rms").select("exercise_name, one_rm_kg").eq("athlete_id", athlete.id);
  const fixedRm = new Map((fixed ?? []).map((r) => [r.exercise_name.toLowerCase(), Number(r.one_rm_kg)]));

  // Running state per exercise, built from history in date order.
  const lastWeight = new Map(); // name -> kg
  const best = new Map(); // name -> kg (heaviest done set)
  const bestE1 = new Map(); // name -> e1RM
  const isLogged = (s) => (s.session_exercises ?? []).some((e) => (e.log ?? []).some((l) => l.done)) || s.rpe != null;

  // Only the stale tail: sessions after the last one the athlete logged
  // (per session type). Earlier unlogged sessions are the original seed's
  // deliberate misses.
  const lastLogged = new Map();
  for (const x of sessions ?? []) if (isLogged(x) && x.date > (lastLogged.get(x.type) ?? "")) lastLogged.set(x.type, x.date);
  const loggedOf = (type) => (sessions ?? []).filter((x) => x.type === type && isLogged(x));

  let filled = 0, missed = 0, pbs = 0;
  for (const s of sessions ?? []) {
    const exs = [...(s.session_exercises ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    if (isLogged(s)) {
      for (const e of exs) {
        const key = e.name.toLowerCase();
        for (const l of e.log ?? []) {
          const w = parseFloat(l.weight);
          if (!l.done || !(w > 0)) continue;
          lastWeight.set(key, w);
          if (w > (best.get(key) ?? 0)) best.set(key, w);
          const r = firstNum(l.reps) ?? firstNum(e.reps) ?? 1;
          bestE1.set(key, Math.max(bestE1.get(key) ?? 0, e1rm(w, r)));
        }
      }
      continue;
    }
    if (s.date <= (lastLogged.get(s.type) ?? "")) continue;
    if (s.type !== "strength") {
      // Cardio / hybrid / power & speed: repeat what the athlete logged the
      // last time they did this session (same name), so trends carry on.
      if (!["cardio", "hyrox", "power_speed"].includes(s.type)) continue;
      const prev = loggedOf(s.type).filter((x) => x.date < s.date);
      const src = [...prev].reverse().find((x) => x.name === s.name) ?? prev[prev.length - 1];
      if (!src) continue;
      if (hash(s.id) % 12 === 0) { missed++; continue; }
      const rpe = src.rpe ?? 6 + (hash(s.id + "rpe") % 3);
      if (!DRY_RUN) {
        const patch = { rpe, rpe_logged_at: `${s.date}T18:30:00Z` };
        if (s.type === "cardio" && src.name === s.name && src.cardio_config) patch.cardio_config = src.cardio_config;
        if (s.type === "hyrox" && src.name === s.name && src.hyrox_config) patch.hyrox_config = src.hyrox_config;
        const { error: sErr } = await sb.from("sessions").update(patch).eq("id", s.id);
        if (sErr) throw sErr;
        if (s.type === "power_speed") {
          for (const e of exs) {
            const from = [...prev].reverse().flatMap((x) => x.session_exercises ?? []).find((x) => x.name === e.name && (x.log ?? []).some((l) => l.done));
            if (!from) continue;
            const { error: uErr } = await sb.from("session_exercises").update({ log: from.log }).eq("id", e.id);
            if (uErr) throw uErr;
          }
        }
      }
      filled++;
      continue;
    }
    if (!exs.length) continue;
    if (hash(s.id) % 12 === 0) { missed++; continue; } // a realistic missed session

    const sessionPbs = [];
    const updates = exs.map((e) => {
      const key = e.name.toLowerCase();
      const sets = e.sets > 0 ? e.sets : (e.log ?? []).length || 3;
      const repsList = String(e.reps ?? "").includes(",") ? String(e.reps).split(",").map((x) => x.trim()) : null;
      const repsFor = (i) => String(firstNum(repsList ? repsList[Math.min(i, repsList.length - 1)] : e.reps) ?? "");
      const timed = !e.reps && e.time;
      let weightFor = () => "";
      if (!e.is_bodyweight && !e.completion_only && !timed) {
        const rm = fixedRm.get(key) ?? (bestE1.get(key) ? bestE1.get(key) * 0.97 : null);
        const pct = e.use_percent_1rm && (e.set_percents ?? []).length ? e.set_percents : null;
        if (pct && rm) {
          weightFor = (i) => String(Math.max(5, roundToPlate((rm * (parseFloat(pct[Math.min(i, pct.length - 1)]) || 70)) / 100)));
        } else {
          const prev = lastWeight.get(key) ?? firstNum(e.target_load);
          if (prev) {
            const w = Math.max(5, roundToPlate(prev + (hash(s.id + key) % 8 === 0 ? 2.5 : 0))); // +2.5kg now and then
            weightFor = () => String(w);
          }
        }
      }
      const log = Array.from({ length: sets }, (_, i) => {
        const row = { weight: weightFor(i), reps: timed ? "" : repsFor(i), time: timed ? String(e.time).replace(/[^0-9]/g, "") : "", done: true };
        if (e.track_velocity) row.velocity = String((Number(e.target_velocity) || 0.75) + ((hash(s.id + key + i) % 7) - 3) / 100);
        return row;
      });
      // Bests / PBs from what was just logged.
      for (const l of log) {
        const w = parseFloat(l.weight);
        if (!(w > 0)) continue;
        lastWeight.set(key, w);
        if (w > (best.get(key) ?? 0)) {
          if (best.has(key)) sessionPbs.push({ exercise_name: e.name, weight_kg: w, reps: parseInt(l.reps, 10) || null });
          best.set(key, w);
        }
        bestE1.set(key, Math.max(bestE1.get(key) ?? 0, e1rm(w, parseInt(l.reps, 10) || 1)));
      }
      return { id: e.id, log };
    });

    const rpe = 6 + (hash(s.id + "rpe") % 3); // 6-8
    if (!DRY_RUN) {
      for (const u of updates) {
        const { error: uErr } = await sb.from("session_exercises").update({ log: u.log }).eq("id", u.id);
        if (uErr) throw uErr;
      }
      const { error: sErr } = await sb.from("sessions").update({ rpe, rpe_logged_at: `${s.date}T18:30:00Z` }).eq("id", s.id);
      if (sErr) throw sErr;
      // One PB per exercise per session (the heaviest).
      const top = new Map();
      for (const p of sessionPbs) if (!top.has(p.exercise_name) || p.weight_kg > top.get(p.exercise_name).weight_kg) top.set(p.exercise_name, p);
      for (const p of top.values()) {
        const { error: pErr } = await sb.from("personal_bests").insert({ athlete_id: athlete.id, session_id: s.id, date: s.date, pb_type: "weight", ...p });
        if (pErr) console.warn(`  PB not saved (${p.exercise_name}): ${pErr.message}`);
        else pbs++;
      }
    } else {
      pbs += new Set(sessionPbs.map((p) => p.exercise_name)).size;
    }
    filled++;
  }
  return `${name}: logged ${filled} session(s), left ${missed} as missed, ${pbs} PB(s)`;
}

async function main() {
  const { data: org, error } = await sb.from("organisations").select("id").eq("name", DEMO_ORG_NAME).single();
  if (error || !org) throw new Error(`No "${DEMO_ORG_NAME}" org found.`);
  const today = todayISO();
  console.log(`${DRY_RUN ? "[dry run] " : ""}Logging unlogged sessions before ${today}`);
  for (const name of ATHLETES) console.log("  " + (await athleteRun(org.id, name, today)));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

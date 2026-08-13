// Spreads the demo org's athletes across the dashboard's "Programme
// expiry" panel buckets (see programmeStatus() in lib/date-utils.ts
// and the statusOf()/needsAttention/onTrack logic in
// app/(coach)/dashboard/page.tsx) so a prospective coach sees a
// realistic mix rather than every athlete in the same state.
//
// That status is purely a function of each athlete's FURTHEST future
// `sessions.date` relative to today — it has nothing to do with the
// programmes/programme_assignments tables. Since seed-demo-org.js
// only seeds sessions up to 1 week ahead of whenever it was last run,
// those dates drift stale (and uniformly "expired") the longer it's
// been since the demo org was seeded. This script only touches
// `sessions` dates, it doesn't re-run the full seed.
//
// Safe to re-run any time: each bucket's marker session (name
// "Programme check-in") is deleted and recreated at a fresh
// relative date, and the "expired" bucket has its future sessions
// removed again if any have crept back in.
//
// Usage: node scripts/set-demo-programme-status.js

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
const MARKER_SESSION_NAME = "Programme check-in";

// >7 days out — dashboard shows green "Nd left" (up to date)
const UP_TO_DATE = ["Jake Morrison", "Sophie Bennett", "Liam O'Connor"];
const UP_TO_DATE_OFFSET_DAYS = 14;

// 0-7 days out — dashboard shows amber "Nd left" (needs attention)
const NEEDS_ATTENTION = ["Ava Thompson", "Ethan Wright"];
const NEEDS_ATTENTION_OFFSET_DAYS = 4;

// No future sessions at all — dashboard shows red "Expired Nd ago"
const EXPIRED = ["Grace Mitchell", "Noah Patel"];

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}
function addDaysISO(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function ensureFutureSession(athlete, offsetDays, today) {
  // Idempotent: clear any previous marker session for this athlete
  // before inserting a fresh one at the correct relative date.
  const { data: existing } = await sb
    .from("sessions")
    .select("id")
    .eq("athlete_id", athlete.id)
    .eq("name", MARKER_SESSION_NAME);
  if (existing?.length) {
    await sb.from("sessions").delete().in("id", existing.map((s) => s.id));
  }

  const date = addDaysISO(today, offsetDays);
  const { data: session, error } = await sb
    .from("sessions")
    .insert({ athlete_id: athlete.id, type: "strength", date, name: MARKER_SESSION_NAME })
    .select()
    .single();
  if (error) throw error;

  await sb.from("session_exercises").insert([
    {
      session_id: session.id,
      name: "Back Squat",
      order: "1",
      sets: 3,
      reps: "5",
      rest: "120s",
      target_load: "",
      tempo: "2-0-2",
      log: [{ weight: "", reps: "", time: "", done: false }, { weight: "", reps: "", time: "", done: false }, { weight: "", reps: "", time: "", done: false }],
    },
  ]);

  console.log(`  ${athlete.name}: marker session set for ${date}`);
}

async function clearFutureSessions(athlete, today) {
  const { data: future } = await sb
    .from("sessions")
    .select("id")
    .eq("athlete_id", athlete.id)
    .gte("date", today);
  if (future?.length) {
    await sb.from("sessions").delete().in("id", future.map((s) => s.id));
  }
  console.log(`  ${athlete.name}: cleared ${future?.length ?? 0} future session(s)`);
}

(async () => {
  const { data: org, error: orgErr } = await sb
    .from("organisations")
    .select("id")
    .eq("name", DEMO_ORG_NAME)
    .maybeSingle();
  if (orgErr) throw orgErr;
  if (!org) {
    console.error(`No organisation named "${DEMO_ORG_NAME}" found — run scripts/seed-demo-org.js first.`);
    process.exit(1);
  }

  const { data: athletes, error: athErr } = await sb
    .from("athletes")
    .select("id, name")
    .eq("organisation_id", org.id)
    .eq("archived", false);
  if (athErr) throw athErr;

  const byName = Object.fromEntries(athletes.map((a) => [a.name, a]));
  const today = todayISO();
  console.log(`Today: ${today}\n`);

  console.log("Up to date (>7 days out):");
  for (const name of UP_TO_DATE) {
    const athlete = byName[name];
    if (!athlete) { console.warn(`  Skipping "${name}" — not found in demo org`); continue; }
    await ensureFutureSession(athlete, UP_TO_DATE_OFFSET_DAYS, today);
  }

  console.log("\nNeeds attention (0-7 days out):");
  for (const name of NEEDS_ATTENTION) {
    const athlete = byName[name];
    if (!athlete) { console.warn(`  Skipping "${name}" — not found in demo org`); continue; }
    await ensureFutureSession(athlete, NEEDS_ATTENTION_OFFSET_DAYS, today);
  }

  console.log("\nExpired (no future sessions):");
  for (const name of EXPIRED) {
    const athlete = byName[name];
    if (!athlete) { console.warn(`  Skipping "${name}" — not found in demo org`); continue; }
    await clearFutureSessions(athlete, today);
  }

  console.log("\nDone.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

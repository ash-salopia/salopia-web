// Broad demo coverage for features the base scripts don't fully populate —
// run AFTER scripts/seed-demo-org.js and scripts/seed-demo-feature-data.js
// (and, optionally, the MAS / RTP athlete seeds).
//
// Adds, all in the "VIS BUILD Demo" org, each section idempotent (it deletes
// the rows it owns first):
//   • a 2nd coach (Sam Rivera) — team settings + a real forum conversation
//   • groups + members, group chat, group + org announcements
//   • competitions with reactions & comments
//   • PB reactions & comments (on the PBs the base seed already made)
//   • challenges with a leaderboard of results
//   • weekly reflections (3 athletes × ~6 weeks)
//   • recovery sessions (+ athlete feedback)
//   • aerobic profiles + Cardio / Hybrid sessions with logged metrics on 3 athletes
//   • a couple of Sport / Other sessions on a healthy athlete
//   • documents (video links)
//   • Coach Forum threads, replies and votes across the rooms
//   • Community leaderboards turned on (strength lifts + testing metrics)
//
// Known gaps it does NOT cover: Power/Speed sprint/jump sessions (fiddly
// rep-result model — VBT velocity profiles already demo that side), the
// Session Library grant flow, guided multi-block recovery routines.
//
// Usage: node scripts/seed-demo-extras.js

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
const SAM_EMAIL = (env.DEMO_COACH_EMAIL || "demo@visbuild.co.uk").replace("@", "+sam@");

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
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}
function agoISO(days, hours = 0) {
  return new Date(Date.now() - days * 864e5 - hours * 36e5).toISOString();
}
const rnd = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function tableExists(name) {
  const { error } = await sb.from(name).select("id").limit(1);
  return !error;
}

async function main() {
  const { data: org, error: orgErr } = await sb
    .from("organisations").select("id").eq("name", DEMO_ORG_NAME).single();
  if (orgErr || !org) {
    console.error(`No "${DEMO_ORG_NAME}" org — run scripts/seed-demo-org.js first.`);
    process.exit(1);
  }

  const { data: coaches } = await sb
    .from("coaches").select("id, name, role, accepted_at, email").eq("organisation_id", org.id);
  const owner = (coaches ?? []).find((c) => c.role === "owner") ?? (coaches ?? [])[0];
  if (!owner) { console.error("Demo org has no coach — run scripts/seed-demo-org.js first."); process.exit(1); }

  // Heal an owner seeded before accepted_at/email were set — otherwise Team
  // Settings shows them as "pending" (the /demo password login never runs
  // ensureCoachProvisioned to flip it).
  if (!owner.accepted_at || !owner.email) {
    await sb.from("coaches").update({
      accepted_at: owner.accepted_at ?? new Date().toISOString(),
      email: owner.email ?? env.DEMO_COACH_EMAIL,
    }).eq("id", owner.id);
    console.log(`Healed owner "${owner.name}" (was showing as pending).`);
  }

  const { data: athleteRows } = await sb
    .from("athletes").select("id, name, group, sex, date_of_birth, bodyweight_kg")
    .eq("organisation_id", org.id).eq("archived", false);
  const athletes = (athleteRows ?? []).filter((a) => !/\((MAS|RTP)\)/.test(a.name));
  if (athletes.length < 4) { console.error("Not enough demo athletes — run scripts/seed-demo-org.js."); process.exit(1); }
  const byName = (n) => athletes.find((a) => a.name === n);
  const A = (i) => athletes[i % athletes.length];
  const demoAthleteIds = (athleteRows ?? []).map((a) => a.id);

  // ── 2nd coach ────────────────────────────────────────────────────────────
  // Password matches the demo owner's so you can sign in as Sam to show the
  // multi-coach view (magic-link login also works).
  const samPw = env.DEMO_COACH_PASSWORD || "demo-sam-visbuild";
  let sam = (coaches ?? []).find((c) => c.name === "Sam Rivera");
  {
    const existingUser = await sb.auth.admin.listUsers();
    const found = existingUser?.data?.users?.find((u) => u.email === SAM_EMAIL);
    let uid = found?.id;
    if (!uid) {
      const { data: made, error } = await sb.auth.admin.createUser({ email: SAM_EMAIL, password: samPw, email_confirm: true });
      if (error) throw error;
      uid = made.user.id;
    } else {
      await sb.auth.admin.updateUserById(uid, { password: samPw });
    }
    await sb.from("coaches").upsert({
      id: uid, organisation_id: org.id, name: "Sam Rivera", role: "coach",
      email: SAM_EMAIL, accepted_at: new Date().toISOString(),
    });
    sam = { id: uid, name: "Sam Rivera", role: "coach" };
    if (!(coaches ?? []).some((c) => c.name === "Sam Rivera")) console.log("Added 2nd coach: Sam Rivera");
  }

  // ── Groups + members ─────────────────────────────────────────────────────
  if (await tableExists("groups")) {
    const groupNames = [...new Set(athletes.map((a) => a.group).filter(Boolean))];
    const colours = ["#3B8BEB", "#B388FF", "#2DD4BF", "#F59E0B"];
    await sb.from("groups").delete().eq("organisation_id", org.id);
    const groupRows = groupNames.map((name, i) => ({
      organisation_id: org.id, name, colour: colours[i % colours.length],
      description: `${name} — demo group`,
    }));
    const { data: groups } = await sb.from("groups").insert(groupRows).select();
    const groupByName = new Map((groups ?? []).map((g) => [g.name, g.id]));
    const members = athletes
      .filter((a) => groupByName.has(a.group))
      .map((a) => ({ group_id: groupByName.get(a.group), athlete_id: a.id }));

    // A larger cross-squad group so the Squads leaderboard view (top 5 +
    // "Show all") has something meaty to show.
    const { data: perfGroup } = await sb.from("groups")
      .insert({ organisation_id: org.id, name: "Performance Squad", colour: "#EF4444", description: "Performance Squad — demo group" })
      .select().single();
    if (perfGroup) {
      groupByName.set("Performance Squad", perfGroup.id);
      for (const a of athletes.slice(0, Math.min(10, athletes.length))) {
        members.push({ group_id: perfGroup.id, athlete_id: a.id });
      }
    }

    await sb.from("group_members").insert(members);
    console.log(`Groups: ${(groups ?? []).length + (perfGroup ? 1 : 0)} with ${members.length} members.`);

    // Group chat
    if (await tableExists("group_messages")) {
      const seniorId = groupByName.get("Senior Squad") ?? groups[0].id;
      const seniorAthletes = athletes.filter((a) => a.group === "Senior Squad");
      await sb.from("group_messages").delete().in("group_id", groups.map((g) => g.id));
      const thread = [
        { t: "coach", who: owner, body: "Session moved to 6:30am Thursday this week — pitch is booked at the usual time.", d: 6 },
        { t: "athlete", who: seniorAthletes[0], body: "👍 see you there", d: 6, h: -2 },
        { t: "athlete", who: seniorAthletes[1] ?? seniorAthletes[0], body: "Can we go through the new warm-up? Bit rushed last time", d: 5 },
        { t: "coach", who: sam, body: "Yeah I'll take you through it before we start. Get there 10 min early if you can.", d: 5, h: -1 },
        { t: "coach", who: owner, body: "Great work in the gym this week everyone — squat numbers are moving.", d: 2 },
      ];
      const gmRows = thread.filter((m) => m.who).map((m) => ({
        group_id: seniorId,
        sender_type: m.t,
        sender_id: m.who.id,
        sender_name: m.who.name,
        body: m.body,
        created_at: agoISO(m.d, m.h ?? 0),
      }));
      await sb.from("group_messages").insert(gmRows);
      console.log(`Group chat: ${gmRows.length} messages.`);
    }

    // Announcements (base seed made 1 pinned org-wide; add a group one + another)
    await sb.from("announcements").delete().eq("organisation_id", org.id).eq("pinned", false);
    const annRows = [
      {
        organisation_id: org.id, coach_id: owner.id, group_id: groupByName.get("U18") ?? null, pinned: false,
        title: "U18s — testing day Saturday", body: "Sprint + jump testing 10am. Trainers, shorts, and eat properly beforehand.",
        created_at: agoISO(3),
      },
      {
        organisation_id: org.id, coach_id: sam.id, group_id: null, pinned: false,
        title: "New exercise videos added", body: "Check the library — I've added demos for the trap-bar jump and the split-stance RDL.",
        created_at: agoISO(8),
      },
    ];
    await sb.from("announcements").insert(annRows);
    console.log(`Announcements: +${annRows.length}.`);
  }

  // ── Competitions ─────────────────────────────────────────────────────────
  if (await tableExists("competitions")) {
    await sb.from("competitions").delete().in("athlete_id", demoAthleteIds);
    const comps = [
      { a: A(0), title: "County Championships — 100m", date: addDaysISO(todayISO(), 9), location: "Alexander Stadium", notes: "Heats 11am, final 3pm." },
      { a: A(1), title: "Regional League Round 4", date: addDaysISO(todayISO(), 2), location: "Home", notes: "" },
      { a: A(3), title: "School Games qualifier", date: addDaysISO(todayISO(), -12), location: "Loughborough", notes: "2nd in the long jump — 5.42m PB." },
    ];
    for (const c of comps) {
      const { data: comp } = await sb.from("competitions").insert({
        athlete_id: c.a.id, organisation_id: org.id, title: c.title,
        competition_date: c.date, location: c.location, notes: c.notes,
      }).select().single();
      if (!comp) continue;
      const reactors = [owner, sam, A(2), A(4)].filter(Boolean);
      await sb.from("competition_reactions").insert(
        reactors.slice(0, rnd(2, 4)).map((r) => ({
          competition_id: comp.id,
          reactor_id: r.id, reactor_type: r.role ? "coach" : "athlete",
          reactor_name: r.name, emoji: pick(["🔥", "💪", "👏", "🚀"]),
        }))
      );
      if (c.notes) {
        await sb.from("competition_comments").insert({
          competition_id: comp.id, author_id: owner.id, author_type: "coach",
          author_name: owner.name, body: "Brilliant result — that PB's been coming. Well earned.",
        });
      }
    }
    console.log(`Competitions: ${comps.length} (with reactions/comments).`);
  }

  // ── PB reactions + comments ──────────────────────────────────────────────
  if (await tableExists("pb_reactions")) {
    const { data: pbs } = await sb
      .from("personal_bests").select("id, athlete_id, exercise_name")
      .in("athlete_id", demoAthleteIds).limit(12);
    await sb.from("pb_reactions").delete().in("pb_id", (pbs ?? []).map((p) => p.id));
    if (await tableExists("pb_comments")) {
      await sb.from("pb_comments").delete().in("pb_id", (pbs ?? []).map((p) => p.id));
    }
    let rCount = 0, cCount = 0;
    for (const pb of pbs ?? []) {
      const reactors = [owner, sam, A(0), A(1), A(2), A(4)].filter((r) => r.id !== pb.athlete_id);
      const chosen = reactors.sort(() => Math.random() - 0.5).slice(0, rnd(1, 4));
      await sb.from("pb_reactions").insert(chosen.map((r) => ({
        pb_id: pb.id, reactor_type: r.role ? "coach" : "athlete",
        reactor_id: r.id, reactor_name: r.name, emoji: pick(["🔥", "💪", "👏", "🎯", "🚀"]),
      })));
      rCount += chosen.length;
      if (Math.random() < 0.4 && await tableExists("pb_comments")) {
        await sb.from("pb_comments").insert({
          pb_id: pb.id, author_id: owner.id, author_type: "coach", author_name: owner.name,
          body: pick(["Big lift 💪", "Textbook — bar speed looked great.", "That's a 5kg jump. Keep it there next week.", "Onwards 🚀"]),
        });
        cCount++;
      }
    }
    console.log(`PBs: ${rCount} reactions, ${cCount} comments.`);
  }

  // ── Challenges ───────────────────────────────────────────────────────────
  if (await tableExists("challenges")) {
    await sb.from("challenges").delete().eq("organisation_id", org.id);
    const defs = [
      { name: "Assault Bike — 10 cal for time", equipment: "bike", metric_key: "duration", duration_cap_seconds: null, direction: "lower", vals: () => rnd(18, 34) },
      { name: "30s Row — max metres", equipment: "erg", metric_key: "distance", duration_cap_seconds: 30, direction: "higher", vals: () => rnd(150, 205) },
      { name: "Broad Jump — max distance (m)", equipment: null, metric_key: "distance", duration_cap_seconds: null, direction: "higher", vals: () => Number((2 + Math.random() * 0.9).toFixed(2)) },
    ];
    for (const d of defs) {
      const { data: ch } = await sb.from("challenges").insert({
        organisation_id: org.id, created_by: owner.id, name: d.name, equipment: d.equipment,
        metric_key: d.metric_key, duration_cap_seconds: d.duration_cap_seconds, direction: d.direction, is_saved: true,
      }).select().single();
      if (!ch) continue;
      const entrants = athletes.slice(0, rnd(4, athletes.length));
      await sb.from("challenge_results").insert(entrants.map((a, i) => ({
        challenge_id: ch.id, athlete_id: a.id, organisation_id: org.id,
        value: d.vals(), logged_by: i % 3 === 0 ? "coach" : "athlete", logged_at: agoISO(rnd(1, 20)),
      })));
    }
    console.log(`Challenges: ${defs.length} with results.`);
  }

  // ── Weekly reflections ───────────────────────────────────────────────────
  if (await tableExists("weekly_reflections")) {
    const reflAthletes = [A(0), A(1), A(3)];
    await sb.from("weekly_reflections").delete().in("athlete_id", reflAthletes.map((a) => a.id));
    const rows = [];
    for (const a of reflAthletes) {
      for (let w = 1; w <= 6; w++) {
        const weekStart = mondayOnOrBefore(addDaysISO(todayISO(), -7 * w));
        rows.push({
          athlete_id: a.id, organisation_id: org.id, week_start: weekStart,
          scores: { intent: rnd(3, 5), consistency: rnd(3, 5), load: rnd(2, 4), recovery: rnd(2, 5), stress: rnd(1, 4) },
          good: pick(["Hit every session and felt strong on the main lifts.", "Sleep was better this week, training felt easier.", "Good energy, chased the hard reps."]),
          better: pick(["Rushed the warm-ups a couple of times.", "Nutrition slipped mid-week.", "Left some quality on the table Friday — tired from school."]),
          how: pick(["Prep meals on Sunday.", "Get to bed 30 min earlier.", "Arrive 15 min early to warm up properly."]),
          created_at: agoISO(7 * w - 1),
        });
      }
    }
    await sb.from("weekly_reflections").insert(rows);
    console.log(`Weekly reflections: ${rows.length} (${reflAthletes.length} athletes × 6 weeks).`);
  }

  // ── Recovery sessions ────────────────────────────────────────────────────
  {
    await sb.from("sessions").delete().in("athlete_id", demoAthleteIds).eq("type", "recovery");
    const recs = [
      { a: A(0), d: -2, cat: "mobility", fmt: "quick", name: "Hip & ankle mobility",
        cfg: { instructions: "10 min flow: 90/90s, ankle rocks, couch stretch. Easy pace, breathe.", duration_minutes: 12, intensity: "low", completed: true, request_feedback: true } },
      { a: A(1), d: -3, cat: "soft_tissue", fmt: "checklist", name: "Lower-body foam roll",
        cfg: { checklist_items: [
          { id: "1", text: "Quads — 60s each", done: true },
          { id: "2", text: "Glutes / piriformis — 60s each", done: true },
          { id: "3", text: "Calves — 45s each", done: true },
          { id: "4", text: "T-spine extensions ×10", done: false },
        ] } },
      { a: A(3), d: -1, cat: "active_recovery", fmt: "quick", name: "Easy spin + stretch",
        cfg: { instructions: "15 min easy bike, keep HR under 120. Then 5 min full-body stretch.", duration_minutes: 20, intensity: "very_low", completed: true, request_feedback: true } },
      { a: A(4), d: -5, cat: "breathing_relaxation", fmt: "quick", name: "Down-regulation breathing",
        cfg: { instructions: "5 rounds box breathing (4-4-4-4), then 5 min lying still.", duration_minutes: 10, intensity: "very_low", completed: true } },
    ];
    let fbCount = 0;
    for (const r of recs) {
      const { data: s } = await sb.from("sessions").insert({
        athlete_id: r.a.id, type: "recovery", date: addDaysISO(todayISO(), r.d), name: r.name,
        recovery_category: r.cat, recovery_format: r.fmt, recovery_config: r.cfg,
      }).select("id").single();
      if (s && r.cfg.request_feedback && await tableExists("session_feedback")) {
        await sb.from("session_feedback").insert({
          session_id: s.id, athlete_id: r.a.id, completion: true,
          recovery_score: rnd(3, 5), soreness: rnd(1, 3), fatigue: rnd(2, 4),
          pain_notes: "", notes: pick(["Felt good after.", "Hips much freer.", ""]),
        });
        fbCount++;
      }
    }
    console.log(`Recovery sessions: ${recs.length} (${fbCount} with feedback).`);
  }

  // ── Aerobic profiles + Cardio / Hybrid sessions ──────────────────────────
  {
    const cardioAthletes = [A(0), A(1), A(4)];
    const profiles = [
      { max_hr: 198, resting_hr: 52, mas_kmh: 16.5 },
      { max_hr: 191, resting_hr: 58, mas_kmh: 15.0 },
      { max_hr: 201, resting_hr: 55, mas_kmh: 17.2 },
    ];
    for (let i = 0; i < cardioAthletes.length; i++) {
      const { error } = await sb.from("athletes").update(profiles[i]).eq("id", cardioAthletes[i].id);
      if (error && /column/.test(error.message)) { console.warn("⚠ aerobic profile columns missing (migration 0086) — skipping profiles."); break; }
    }
    await sb.from("sessions").delete().in("athlete_id", cardioAthletes.map((a) => a.id)).in("type", ["cardio", "hyrox"]);
    const week = (n) => addDaysISO(mondayOnOrBefore(todayISO()), -7 * n);
    let cCount = 0;
    for (let i = 0; i < cardioAthletes.length; i++) {
      const a = cardioAthletes[i];
      for (let w = 0; w < 5; w++) {
        // continuous run — improving pace week on week
        const dur = 40 + rnd(-3, 3);
        const paceSec = 300 - w * 4 + rnd(-5, 5); // gets faster
        const rpe = clamp(6 + rnd(-1, 1), 1, 10);
        await sb.from("sessions").insert({
          athlete_id: a.id, type: "cardio", cardio_type: "continuous",
          date: addDaysISO(week(w), 1), name: "Aerobic run — Z2", rpe, rpe_logged_at: new Date().toISOString(),
          duration_min: dur,
          cardio_config: {
            modality: "Run", duration: String(dur), zone: 2,
            tracked_metrics: ["distance", "duration", "pace", "avg_hr"],
            default_distance_unit: "km",
            metrics: { duration: String(dur), distance: (dur / (paceSec / 60)).toFixed(1), pace: `${Math.floor(paceSec / 60)}:${String(paceSec % 60).padStart(2, "0")}`, avg_hr: String(150 + rnd(-8, 8)) },
          },
        });
        cCount++;
        // hyrox interval every other week
        if (w % 2 === 0) {
          const hd = 28 + rnd(-2, 4);
          await sb.from("sessions").insert({
            athlete_id: a.id, type: "hyrox", hyrox_type: "interval",
            date: addDaysISO(week(w), 4), name: "SkiErg intervals — 6×500m", rpe: clamp(7 + rnd(-1, 1), 1, 10),
            rpe_logged_at: new Date().toISOString(), duration_min: hd,
            hyrox_config: {
              exercise: "SkiErg", sets: "6", workSec: "110", restSec: "80", zone: 4,
              tracked_metrics: ["duration", "avg_hr"],
              metrics: { duration: String(hd), avg_hr: String(168 + rnd(-6, 6)) },
            },
          });
          cCount++;
        }
      }
    }
    console.log(`Cardio/Hybrid: ${cCount} sessions across ${cardioAthletes.length} athletes (+ aerobic profiles).`);
  }

  // ── Sport / Other on a healthy athlete ───────────────────────────────────
  {
    const sportA = A(2);
    await sb.from("sessions").delete().eq("athlete_id", sportA.id).eq("type", "sport");
    const sport = [
      { d: -4, name: "Club training", dur: 75, rpe: 6, src: "athlete_logged" },
      { d: -8, name: "5-a-side", dur: 55, rpe: 7, src: "athlete_logged" },
      { d: -11, name: "Skills & finishing session", dur: 45, rpe: 5, src: "programme" },
    ];
    for (const s of sport) {
      await sb.from("sessions").insert({
        athlete_id: sportA.id, type: "sport", date: addDaysISO(todayISO(), s.d), name: s.name,
        rpe: s.rpe, rpe_logged_at: new Date().toISOString(), duration_min: s.dur,
        session_source: s.src, sport_config: { planned: { duration_min: s.dur, rpe: s.rpe } },
      });
    }
    console.log(`Sport / Other: ${sport.length} sessions on ${sportA.name}.`);
  }

  // ── Documents ────────────────────────────────────────────────────────────
  if (await tableExists("athlete_documents")) {
    await sb.from("athlete_documents").delete().in("athlete_id", demoAthleteIds);
    const docs = [
      { a: A(0), title: "Individual mobility routine", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", notes: "Daily, 8–10 min." },
      { a: A(1), title: "Sprint mechanics — drills", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", notes: "Watch before Thursday." },
      { a: A(3), title: "Return-to-training checklist", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", notes: "" },
    ];
    await sb.from("athlete_documents").insert(docs.map((d) => ({
      athlete_id: d.a.id, organisation_id: org.id, created_by: owner.id,
      title: d.title, doc_type: "video_link", video_url: d.url, notes: d.notes,
    })));
    console.log(`Documents: ${docs.length} video links.`);
  }

  // ── Coach Forum ──────────────────────────────────────────────────────────
  if (await tableExists("forum_threads")) {
    const { data: rooms } = await sb.from("forum_rooms").select("id, slug");
    const room = (slug) => (rooms ?? []).find((r) => r.slug === slug)?.id;
    if (room("general")) {
      await sb.from("forum_threads").delete().in("coach_id", [owner.id, sam.id]);
      const threads = [
        { room: "programming", who: owner, title: "How are people structuring in-season lower-body work?",
          body: "Two 45-min sessions a week alongside 3 pitch sessions. Currently one heavy (3–5 reps), one speed-strength. Curious what others run when contact load is high.",
          replies: [
            { who: sam, body: "Similar here. I drop the heavy day the week of a big fixture and keep just the speed-strength + some iso work for the hamstrings." },
            { who: owner, body: "Yeah the iso work has made a real difference to our soft-tissue numbers this season." },
          ] },
        { room: "rehab", who: sam, title: "Hamstring return-to-run progressions",
          body: "What criteria are people using to progress from tempo runs to max-velocity exposure? We use a mix of ASLR, force-plate asymmetry <10%, and pain-free repeated sprints, but interested in others' checklists.",
          replies: [
            { who: owner, body: "We add repeated-sprint tolerance as the last gate — 6×30m at 90%+ with full recovery, no next-day reaction. The load-monitoring in here has been handy for catching when we've ramped too fast." },
          ] },
        { room: "testing", who: owner, title: "Youth CMJ — how often do you retest?",
          body: "Every 6 weeks feels about right for a training effect to show without chasing noise. Anyone doing it more/less often with U16s?",
          replies: [] },
        { room: "journal-club", who: sam, title: "Gabbett (2016) — the training–injury prevention paradox",
          jc: { jc_source_type: "article", jc_reference: "Gabbett TJ. Br J Sports Med. 2016;50(5):273-280.",
                jc_takeaways: "High chronic loads can be protective. It's the spike relative to what an athlete is prepared for — not high load per se — that raises risk. ACWR sweet spot ~0.8–1.3." },
          body: "Summary for the club: the paper argues under-training leaves athletes unprepared for competition demands. Well-developed physical qualities + appropriately high chronic loads reduce injury risk; rapid increases in acute load increase it.",
          replies: [
            { who: owner, body: "This is basically the reasoning behind the ACWR view we've been using. Worth a read if you haven't." },
          ] },
        { room: "feature-requests", who: owner, title: "Export a squad's weekly load as CSV",
          body: "Would love to pull weekly sRPE load for a whole group into a spreadsheet for the wider MDT meeting.",
          vote: true, replies: [] },
      ];
      let tCount = 0, rCount = 0;
      for (const t of threads) {
        const rid = room(t.room);
        if (!rid) continue;
        const { data: thread } = await sb.from("forum_threads").insert({
          room_id: rid, coach_id: t.who.id, title: t.title, body: t.body,
          pinned: false, created_at: agoISO(rnd(3, 20)), last_activity_at: agoISO(rnd(0, 2)),
          ...(t.jc ?? {}),
        }).select("id").single();
        if (!thread) continue;
        tCount++;
        for (const r of t.replies ?? []) {
          await sb.from("forum_replies").insert({
            thread_id: thread.id, coach_id: r.who.id, body: r.body, created_at: agoISO(rnd(0, 2)),
          });
          rCount++;
        }
        if (t.vote && await tableExists("forum_thread_votes")) {
          await sb.from("forum_thread_votes").insert([
            { thread_id: thread.id, coach_id: owner.id }, { thread_id: thread.id, coach_id: sam.id },
          ]);
        }
      }
      console.log(`Coach Forum: ${tCount} threads, ${rCount} replies.`);
    }
  }

  // ── Live Group: "ready to progress" hints ────────────────────────────────
  // Live Group shows "💡 Marked ready to progress last time" under an exercise
  // when the previous same-named session set session_exercises.progress = "yes"
  // (the coach's 👍 or the athlete's own "could you have progressed this?").
  // None of the other seeds touch that field, so seed a clean example: a
  // logged session ~6 days ago with progress flags, plus a matching unlogged
  // session TODAY so it appears the moment a coach opens Live Group.
  {
    const liveAthletes = athletes
      .filter((a) => /Jake Morrison|Sophie Bennett|Ava Thompson/.test(a.name))
      .slice(0, 2);
    const exDefs = [
      // Paused Front Squat: tracked pause. Last time 1s; today's target 2s — when
      // the coach logs 2s at the same weight, "Best:" reads "same, +1s pause" (green).
      { name: "Paused Front Squat", order: "1", sets: 3, reps: "4", w: 70, progress: "", track_pause: true, pastPause: "1", targetPause: "2" },
      { name: "Barbell Back Squat", order: "2", sets: 4, reps: "5", w: 100, progress: "yes" },
      { name: "Romanian Deadlift", order: "3", sets: 3, reps: "8", w: 80, progress: "yes" },
      { name: "Barbell Bench Press", order: "4", sets: 4, reps: "6", w: 65, progress: "" },
    ];
    const hasPauseCol = !(await sb.from("session_exercises").select("track_pause").limit(1)).error;
    const mkRows = (sessionId, logged) => exDefs.map((e, i) => ({
      session_id: sessionId, name: e.name, order: e.order, sets: e.sets, reps: e.reps,
      time: "", rest: "120s", target_load: "", tempo: "2-0-2", sort_order: i, is_bodyweight: false,
      progress: logged ? e.progress : "", progress_reminder: false,
      ...(hasPauseCol && e.track_pause ? { track_pause: true, target_pause: e.targetPause ?? "" } : {}),
      log: Array.from({ length: e.sets }, () => ({
        weight: logged ? String(e.w) : "", reps: logged ? e.reps.replace(/\D.*/, "") : "", time: "",
        pause: hasPauseCol && logged && e.track_pause ? e.pastPause : "", done: !!logged,
      })),
    }));
    for (const a of liveAthletes) {
      await sb.from("sessions").delete().eq("athlete_id", a.id).eq("name", "Lower A — Live demo");
      const past = await sb.from("sessions").insert({
        athlete_id: a.id, type: "strength", date: addDaysISO(todayISO(), -6), name: "Lower A — Live demo",
      }).select("id").single();
      if (past.data) await sb.from("session_exercises").insert(mkRows(past.data.id, true));
      const todaySess = await sb.from("sessions").insert({
        athlete_id: a.id, type: "strength", date: todayISO(), name: "Lower A — Live demo",
      }).select("id").single();
      if (todaySess.data) await sb.from("session_exercises").insert(mkRows(todaySess.data.id, false));
    }
    console.log(`Live Group: ${liveAthletes.length} athletes with progress + pause hints today${hasPauseCol ? "" : " (pause skipped — 0090 not applied)"}.`);
  }

  // ── Community leaderboards ───────────────────────────────────────────────
  {
    const { data: o } = await sb.from("organisations").select("settings").eq("id", org.id).single();
    const settings = o?.settings ?? {};
    // Put ~6 varied testing metrics on the board (leave the rest off) to show
    // the per-test picker; null here would mean "every eligible metric".
    const { data: mets } = await sb.from("test_metrics")
      .select("id, name, is_bilateral").eq("organisation_id", org.id).eq("is_bilateral", false);
    const wanted = ["10m Sprint", "20m Sprint", "Countermovement Jump", "CMJ", "Broad Jump", "Isometric Mid-Thigh Pull", "IMTP", "Sit and Reach", "Yo-Yo IR1"];
    const pickedMetrics = (mets ?? [])
      .filter((m) => wanted.some((w) => m.name.toLowerCase().includes(w.toLowerCase())))
      .map((m) => m.id);
    settings.leaderboards_enabled = true;
    settings.leaderboards = {
      strength_exercises: [
        { name: "Barbell Back Squat", relative: true, absolute: true },
        { name: "Barbell Bench Press", relative: true, absolute: true },
        { name: "Romanian Deadlift", relative: true, absolute: false },
        { name: "Barbell Overhead Press", relative: false, absolute: true },
      ],
      test_metrics: pickedMetrics.length ? pickedMetrics : null,
    };
    await sb.from("organisations").update({ settings }).eq("id", org.id);
    console.log(`Leaderboards: enabled — 4 strength lifts (per-exercise ×BW/kg) + ${pickedMetrics.length || "all"} testing metrics.`);
  }

  console.log(`\n✓ Demo extras seeded in "${DEMO_ORG_NAME}".`);
  console.log("  Sign in via /demo → the dashboard, Community, Challenges, Documents, Coach Forum,");
  console.log("  and the athletes' calendars now have Recovery / Cardio / Hybrid / Sport sessions.");
  console.log("  Gaps not covered: Power/Speed sprint sessions, Session Library grants, guided recovery routines.");
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

main().catch((e) => { console.error("SEED FAILED:", e.message); process.exit(1); });

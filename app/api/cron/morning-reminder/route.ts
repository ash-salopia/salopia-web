import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { sendPushToAthlete } from "@/lib/push/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/cron/morning-reminder — runs every 15 minutes (see
// vercel.json), one athlete-configurable "you have a session today"
// push, separate from the evening "haven't started/rated" reminder in
// api/cron/notifications (that one only fires if they still haven't
// trained by the evening; this one fires regardless, right around
// whatever time the athlete picked via the <input type="time"> in
// PushNotificationToggle.tsx).
//
// Runs every 15 min rather than once daily so morning_reminder_time
// can actually be "the exact time the athlete chose" rather than one
// fixed time for everyone — each athlete's chosen time falls into
// exactly one 15-minute window per day, so this naturally sends once
// per athlete per day without needing a separate "already sent today"
// table. Requires a Vercel plan whose cron supports sub-daily
// schedules (Hobby is once-per-day only) — on Hobby this route still
// works, it just only gets a chance to fire once a day at whatever
// time Vercel actually runs it, not at each athlete's chosen minute.
//
// No per-athlete timezone field exists yet (see 0063's migration
// comment) - morning_reminder_time is compared against server/UTC
// time, same simplification the evening cron already makes.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Round down to the current 15-minute window, matching the cron's
  // own cadence - e.g. a run at 07:03 covers anyone whose chosen time
  // is [07:00, 07:15).
  const windowMinutes = Math.floor(now.getUTCMinutes() / 15) * 15;
  const windowStart = `${String(now.getUTCHours()).padStart(2, "0")}:${String(windowMinutes).padStart(2, "0")}:00`;
  const windowEndDate = new Date(now);
  windowEndDate.setUTCMinutes(windowMinutes + 15, 0, 0);
  const windowEnd = `${String(windowEndDate.getUTCHours()).padStart(2, "0")}:${String(windowEndDate.getUTCMinutes()).padStart(2, "0")}:00`;

  let athleteQuery = service
    .from("athletes")
    .select("id")
    .eq("notify_morning_reminder", true)
    .gte("morning_reminder_time", windowStart);
  // A window crossing midnight (e.g. 23:45-00:00) can't express as a
  // single gte/lt range the normal way - not reachable in practice
  // since a day only has one such window and Postgres `time` doesn't
  // wrap, so just skip the upper bound there and rely on the exact
  // windowStart match plus the 24-run-a-day cadence to still catch it
  // next pass if missed.
  if (windowEnd !== "00:00:00") athleteQuery = athleteQuery.lt("morning_reminder_time", windowEnd);

  const { data: dueAthletes, error } = await athleteQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!dueAthletes?.length) return NextResponse.json({ ok: true, notified: 0 });

  const dueIds = dueAthletes.map((a) => a.id);

  const { data: sessions } = await service
    .from("sessions")
    .select("athlete_id, name, session_exercises(id)")
    .in("athlete_id", dueIds)
    .eq("date", today)
    .eq("session_source", "programme")
    .eq("is_primer", false);

  const athletesWithSession = new Map<string, string>(); // athlete_id -> session name
  for (const sess of sessions ?? []) {
    if (((sess as any).session_exercises ?? []).length > 0 && !athletesWithSession.has(sess.athlete_id)) {
      athletesWithSession.set(sess.athlete_id, sess.name);
    }
  }

  await Promise.all(
    [...athletesWithSession.entries()].map(([athleteId, sessionName]) =>
      sendPushToAthlete(athleteId, {
        title: "You've got a session today",
        body: sessionName || "Check your programme for today's session.",
        url: "/",
      })
    )
  );

  return NextResponse.json({ ok: true, notified: athletesWithSession.size });
}

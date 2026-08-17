import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { sendPushToAthlete } from "@/lib/push/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/cron/notifications — runs once daily (see vercel.json),
// evening-scheduled so it catches a full day's sessions. Checks two
// of the three original push scenarios (the third, PB alerts, is
// event-driven — see app/api/athlete-link/log/route.ts):
//
//  - Missed session: assigned for today, coach-built (has exercises),
//    but nothing at all logged against it.
//  - RPE not logged: every prescribed set is ticked done, but the
//    athlete never rated the session (same "coach-assigned, not
//    primer" scope as lib/report-calc.ts's collectCompletion, so this
//    never nags about an informal Session Library session or a
//    primer/activation block).
//
// One push per athlete per condition, even if they have more than one
// qualifying session today - a wall of pings for a busy day would
// just get the notification muted.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: sessions, error } = await service
    .from("sessions")
    .select("id, athlete_id, name, rpe, session_exercises(id, log, is_primer)")
    .eq("date", today)
    .eq("session_source", "programme")
    .eq("is_primer", false);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const missedAthleteIds = new Set<string>();
  const rpeAthleteIds = new Set<string>();

  for (const sess of sessions ?? []) {
    const exercises = ((sess as any).session_exercises ?? []).filter((e: any) => !e.is_primer);
    const allSets = exercises.flatMap((e: any) => e.log ?? []);
    if (!allSets.length) continue; // nothing prescribed - not a real training day

    const anyDone = allSets.some((s: any) => s.done);
    const allDone = allSets.every((s: any) => s.done);

    if (!anyDone) {
      missedAthleteIds.add(sess.athlete_id);
    } else if (allDone && sess.rpe == null) {
      rpeAthleteIds.add(sess.athlete_id);
    }
  }

  // Per-notification-type opt-out (0062) - separate from whether the
  // athlete is subscribed to push at all. One bulk lookup rather than
  // a row-per-athlete query, since this can run across the whole
  // roster every evening.
  const candidateIds = [...new Set([...missedAthleteIds, ...rpeAthleteIds])];
  const prefsById = new Map<string, { notify_missed_session: boolean; notify_rpe_reminder: boolean }>();
  if (candidateIds.length) {
    const { data: prefRows } = await service
      .from("athletes")
      .select("id, notify_missed_session, notify_rpe_reminder")
      .in("id", candidateIds);
    for (const row of prefRows ?? []) {
      prefsById.set(row.id, {
        notify_missed_session: row.notify_missed_session ?? true,
        notify_rpe_reminder: row.notify_rpe_reminder ?? true,
      });
    }
  }

  const missedToNotify = [...missedAthleteIds].filter((id) => prefsById.get(id)?.notify_missed_session !== false);
  const rpeToNotify = [...rpeAthleteIds].filter((id) => prefsById.get(id)?.notify_rpe_reminder !== false);

  await Promise.all([
    ...missedToNotify.map((athleteId) =>
      sendPushToAthlete(athleteId, {
        title: "Today's session is waiting",
        body: "You haven't logged anything for today's session yet.",
        url: "/",
      })
    ),
    ...rpeToNotify.map((athleteId) =>
      sendPushToAthlete(athleteId, {
        title: "Rate today's session",
        body: "Nice work finishing today's session — how did it feel?",
        url: "/",
      })
    ),
  ]);

  return NextResponse.json({
    ok: true,
    missed: missedToNotify.length,
    rpeReminders: rpeToNotify.length,
  });
}

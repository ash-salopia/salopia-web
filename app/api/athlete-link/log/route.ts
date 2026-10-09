import { NextResponse } from "next/server";
import { getAthleteByShareToken, updateAthleteSetLog, getOrgSettingsForAthlete } from "@/lib/data/athlete-share-link";
import { notifyCoachesOfPB } from "@/lib/push/send";
import { detectPB, type DetectedPB } from "@/lib/pb-detect";
import type { SetLog } from "@/types";

const PB_KIND_LABEL: Record<DetectedPB["kind"], string> = {
  weight: "heaviest weight",
  e1rm: "estimated 1RM",
  volume: "session volume",
  bw_reps: "most reps",
  bw_time: "longest hold",
};

function fmtPBValue(pb: DetectedPB): string {
  if (pb.kind === "e1rm") return `e1RM ${pb.e1rmKg}kg`;
  if (pb.kind === "volume") return `${pb.volumeKg}kg total volume`;
  if (pb.weightKg != null) return `${pb.weightKg}kg${pb.reps ? ` × ${pb.reps}` : ""}`;
  if (pb.reps != null) return `${pb.reps} reps`;
  if (pb.timeSeconds != null) return `${pb.timeSeconds}s`;
  return "";
}

export async function POST(request: Request) {
  let body: { token?: string; sessionId?: string; exerciseId?: string; log?: SetLog[] };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }

  const { token, sessionId, exerciseId, log } = body;
  if (!token || !sessionId || !exerciseId || !Array.isArray(log)) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const athlete = await getAthleteByShareToken(token);
    if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    await updateAthleteSetLog(sessionId, athlete.id, exerciseId, log);
    // 0073 — PB tracking off (org setting or this athlete's override)
    // skips detection entirely, so no personal_bests row is ever
    // written/updated for this save while it's off.
    const orgSettings = await getOrgSettingsForAthlete(athlete.id);
    const pbEnabled = orgSettings.pb_enabled !== false && (athlete as any).pb_enabled !== false;
    // Awaited (not fire-and-forget) so the athlete app can show a
    // celebration popup off the same response — a couple of extra fast
    // lookups is worth it for the immediate "New PB!" feedback.
    const pbs = pbEnabled ? await detectPB(athlete.id, exerciseId, sessionId, log) : [];
    if (pbs.length) {
      // Awaited like detectPB above, but never lets a push failure
      // (missing VAPID config, a dead subscription) fail the actual
      // set save - notifyCoachesOfPB never throws. One notification
      // per save even when several lanes PB'd at once (e.g. heaviest
      // weight AND best session volume in the same sitting).
      const summary = pbs.map((pb) => `${PB_KIND_LABEL[pb.kind]}: ${fmtPBValue(pb)}`).join(", ");
      await notifyCoachesOfPB(athlete.organisation_id, {
        title: `🏆 ${athlete.name} hit a PB!`,
        body: `${pbs[0].exerciseName} — ${summary}`,
      }).catch(() => {});
    }
    // "pb" (singular, first/primary) kept for any older client code
    // still reading it; "pbs" is the full set for the celebration modal.
    return NextResponse.json({ ok: true, pb: pbs[0] ?? null, pbs });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save" }, { status: 400 });
  }
}

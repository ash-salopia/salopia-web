import { NextResponse } from "next/server";
import { getAthleteByShareToken, createAthleteSportSession, getOrgSettingsForAthlete } from "@/lib/data/athlete-share-link";

export async function POST(request: Request) {
  let body: { token?: string; activity?: string; durationMin?: number | null; rpe?: number | null; notes?: string; date?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { token, activity, durationMin, rpe, notes, date } = body;
  if (!token || !activity || !activity.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const athlete = await getAthleteByShareToken(token);
    if (!athlete) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }
    // Feature-gated: an athlete can only log these when the coach has the
    // load-monitoring toggle on.
    const settings = await getOrgSettingsForAthlete(athlete.id);
    if (!settings.load_monitoring_enabled) {
      return NextResponse.json({ error: "Not available" }, { status: 403 });
    }
    const session = await createAthleteSportSession(athlete.id, {
      activity,
      durationMin: durationMin ?? null,
      rpe: rpe ?? null,
      notes: notes ?? "",
      date,
    });
    return NextResponse.json({ ok: true, session });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { getAthleteByShareToken, getOrgSettingsForAthlete, submitChallengeResult } from "@/lib/data/athlete-share-link";

export async function POST(request: Request) {
  let body: { token?: string; challengeId?: string; value?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { token, challengeId, value } = body;
  if (!token || !challengeId || value == null || isNaN(value)) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const athlete = await getAthleteByShareToken(token);
    if (!athlete) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }

    // 0074 — Challenges off (org setting or this athlete's override)
    // rejects the write entirely, mirroring the PB toggle's routes.
    const orgSettings = await getOrgSettingsForAthlete(athlete.id);
    const challengesEnabled = orgSettings.challenges_enabled !== false && (athlete as any).challenges_enabled !== false;
    if (!challengesEnabled) {
      return NextResponse.json({ error: "Challenges are disabled" }, { status: 403 });
    }

    await submitChallengeResult(challengeId, athlete.id, athlete.organisation_id, value);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

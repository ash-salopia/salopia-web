import { NextResponse } from "next/server";
import { getAthleteByShareToken, submitCheckIn } from "@/lib/data/athlete-share-link";
import type { CheckInAnswers } from "@/lib/checkin";

export async function POST(request: Request) {
  let body: {
    token?: string;
    energy?: number; sleep?: number; soreness?: number; volume?: number;
    // 0088 — optional wellness / pain fields
    fatigue?: number; stress?: number; pain_score?: number;
    pain_location?: string; wellness_notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { token, energy, sleep, soreness, volume } = body;
  if (!token || energy == null || sleep == null || soreness == null || volume == null) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Only forward wellness/pain keys that were actually supplied so an
  // upsert never nulls a column the athlete didn't answer.
  const answers: CheckInAnswers = { energy, sleep, soreness, volume };
  if (body.fatigue != null) answers.fatigue = body.fatigue;
  if (body.stress != null) answers.stress = body.stress;
  if (body.pain_score != null) answers.pain_score = body.pain_score;
  if (body.pain_location != null && body.pain_location.trim()) answers.pain_location = body.pain_location.trim();
  if (body.wellness_notes != null && body.wellness_notes.trim()) answers.wellness_notes = body.wellness_notes.trim();

  try {
    const athlete = await getAthleteByShareToken(token);
    if (!athlete) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }
    const checkin = await submitCheckIn(athlete.id, answers);
    return NextResponse.json({ ok: true, checkin });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

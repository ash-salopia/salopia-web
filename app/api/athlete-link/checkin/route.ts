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

  // Beta launch, 2026-09-23 — wellness/pain fields are rejected outright,
  // never persisted, regardless of what a client posts. This is deliberate
  // defense-in-depth: the athlete-side UI already hides these questions
  // (CheckInModal's wellnessEnabled/painEnabled props both derive from
  // org.load_monitoring_enabled, forced false in mergeOrgSettings — see
  // lib/data/settings.ts), but that's a client-side gate a stale client or
  // a hand-crafted request could bypass. This route accepting the fields
  // unconditionally was the actual gap; closing it here means no RTP/pain/
  // wellness data can reach the database through this endpoint at all
  // while the health-data hosting question is unresolved (see the AWS
  // migration's docs/DATA_RESIDENCY_DECISION.md), not just hidden from view.
  const answers: CheckInAnswers = { energy, sleep, soreness, volume };

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

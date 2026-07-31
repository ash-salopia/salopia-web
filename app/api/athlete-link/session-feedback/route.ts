import { NextResponse } from "next/server";
import { getAthleteByShareToken, submitSessionFeedback } from "@/lib/data/athlete-share-link";

export async function POST(request: Request) {
  let body: {
    token?: string;
    sessionId?: string;
    completion?: boolean | null;
    recovery_score?: number | null;
    soreness?: number | null;
    fatigue?: number | null;
    pain_notes?: string;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { token, sessionId } = body;
  if (!token || !sessionId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const athlete = await getAthleteByShareToken(token);
    if (!athlete) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }
    await submitSessionFeedback(sessionId, athlete.id, {
      completion: body.completion ?? null,
      recovery_score: body.recovery_score ?? null,
      soreness: body.soreness ?? null,
      fatigue: body.fatigue ?? null,
      pain_notes: body.pain_notes ?? "",
      notes: body.notes ?? "",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

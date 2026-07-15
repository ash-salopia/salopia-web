import { NextResponse } from "next/server";
import { getAthleteByShareToken, setAthleteExerciseOptOut } from "@/lib/data/athlete-share-link";

// POST /api/athlete-link/opt-out-exercise
// Marks an exercise skipped (or un-skips it) for this session only —
// no replacement, doesn't affect the athlete's assigned programme.
export async function POST(request: Request) {
  let body: { token?: string; sessionId?: string; exerciseId?: string; optedOut?: boolean };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }

  const { token, sessionId, exerciseId, optedOut } = body;
  if (!token || !sessionId || !exerciseId || typeof optedOut !== "boolean") {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const athlete = await getAthleteByShareToken(token);
    if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    await setAthleteExerciseOptOut(sessionId, athlete.id, exerciseId, optedOut);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save" }, { status: 400 });
  }
}

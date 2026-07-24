import { NextResponse } from "next/server";
import { getAthleteByShareToken, updateAthleteExerciseNotes } from "@/lib/data/athlete-share-link";

// POST /api/athlete-link/exercise-notes
// Athlete's own note on one exercise, separate from the coach's
// prescription note and the athlete's session-level note.
export async function POST(request: Request) {
  let body: { token?: string; sessionId?: string; exerciseId?: string; notes?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }

  const { token, sessionId, exerciseId, notes } = body;
  if (!token || !sessionId || !exerciseId || notes == null) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const athlete = await getAthleteByShareToken(token);
    if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    await updateAthleteExerciseNotes(sessionId, athlete.id, exerciseId, notes);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save" }, { status: 400 });
  }
}

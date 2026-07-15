import { NextResponse } from "next/server";
import { getAthleteByShareToken, swapAthleteExercise } from "@/lib/data/athlete-share-link";

// POST /api/athlete-link/swap-exercise
// Substitutes a prescribed exercise for an alternative (coach-approved
// or freely chosen), scoped to this one session — never touches the
// athlete's actual assigned programme.
export async function POST(request: Request) {
  let body: { token?: string; sessionId?: string; exerciseId?: string; name?: string; videoUrl?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }

  const { token, sessionId, exerciseId, name } = body;
  const videoUrl = body.videoUrl ?? "";
  if (!token || !sessionId || !exerciseId || !name?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const athlete = await getAthleteByShareToken(token);
    if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    await swapAthleteExercise(sessionId, athlete.id, exerciseId, name.trim(), videoUrl);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save" }, { status: 400 });
  }
}

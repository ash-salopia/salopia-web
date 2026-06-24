import { NextResponse } from "next/server";
import { getAthleteByShareToken, updateAthleteProgress } from "@/lib/data/athlete-share-link";

export async function POST(request: Request) {
  let body: { token?: string; exerciseId?: string; progress?: "" | "yes" | "no" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { token, exerciseId, progress } = body;
  if (!token || !exerciseId || progress == null) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!["", "yes", "no"].includes(progress)) {
    return NextResponse.json({ error: "Invalid progress value" }, { status: 400 });
  }

  try {
    const athlete = await getAthleteByShareToken(token);
    if (!athlete) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }
    await updateAthleteProgress(exerciseId, athlete.id, progress);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

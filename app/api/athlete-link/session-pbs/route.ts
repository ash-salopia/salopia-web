import { NextResponse } from "next/server";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/athlete-link/session-pbs?token=xxx&sessionId=xxx
// The athlete's own PBs set in one session — powers the 🏆 stat on the
// Session summary modal. Client-fetched when the modal opens so it
// reflects PBs hit moments earlier in the same sitting (a server render
// at page load would miss those). One row per exercise per session,
// guaranteed by the (athlete_id, exercise_name, session_id) unique
// constraint (0039).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const sessionId = searchParams.get("sessionId");
  if (!token || !sessionId) {
    return NextResponse.json({ error: "Missing token or sessionId" }, { status: 400 });
  }

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();

  // Confirm the session is this athlete's before returning anything keyed
  // to it — never trust a sessionId from the request on its own.
  const { data: session } = await supabase
    .from("sessions")
    .select("id, athlete_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.athlete_id !== athlete.id) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("personal_bests")
    .select("exercise_name, weight_kg, reps, time_seconds")
    .eq("athlete_id", athlete.id)
    .eq("session_id", sessionId)
    .order("exercise_name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ pbs: data ?? [] });
}

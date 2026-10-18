import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { notifyAthleteOfMessage } from "@/lib/push/send";
import { REACTION_EMOJI, quoteForPush } from "@/lib/message-reactions";

// A coach's 👍/👎 on a session comment (0120) is written straight through
// the browser client (RLS); push is server-only, so this route sends the
// athlete's notification afterwards. It reads the session back through
// the coach's own RLS client, so a coach can only trigger a push for a
// session they can actually see.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  const { data: session } = await supabase
    .from("sessions")
    .select("id, name, athlete_id, athlete_notes, athlete_notes_reaction, athlete_notes_reaction_by, athlete:athletes(share_token)")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const reaction = session.athlete_notes_reaction as "up" | "down" | null;
  if (!reaction) return NextResponse.json({ ok: true });

  const athlete = Array.isArray(session.athlete) ? session.athlete[0] : session.athlete;
  notifyAthleteOfMessage(session.athlete_id, {
    title: `${session.athlete_notes_reaction_by || "Your coach"} reacted ${REACTION_EMOJI[reaction]}`,
    body: `To your comment on ${session.name}: ${quoteForPush(session.athlete_notes ?? "", false)}`,
    url: athlete?.share_token ? `/a/${athlete.share_token}/sessions/${session.id}` : "/",
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}

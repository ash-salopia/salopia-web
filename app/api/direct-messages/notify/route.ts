import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { notifyAthleteOfMessage } from "@/lib/push/send";
import { REACTION_EMOJI, quoteForPush } from "@/lib/message-reactions";

// A coach's direct-message send goes straight through the browser
// client into direct_messages (RLS covers it - no server route needed
// for the write itself, same as GroupChat.tsx's coach-side insert).
// Push notifications are server-only code though, so this route exists
// purely to trigger that side effect after a successful send - not to
// do the write.
export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: coach } = await supabase.from("coaches").select("id, name").eq("id", user.id).single();
  if (!coach) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { athleteId, text, reaction, messageId } = body;
  if (!athleteId) return NextResponse.json({ error: "athleteId required" }, { status: 400 });

  // Verify this athlete is actually in the coach's org before pushing
  // to them - RLS already enforced this for the message write, but
  // this route has no RLS of its own (service-role push send).
  const { data: athlete } = await supabase.from("athletes").select("id, share_token").eq("id", athleteId).maybeSingle();
  if (!athlete) return NextResponse.json({ error: "Athlete not found" }, { status: 404 });

  // A 👍/👎 on one of the athlete's messages (0117) rather than a new message.
  if (reaction === "up" || reaction === "down") {
    if (!messageId) return NextResponse.json({ error: "messageId required" }, { status: 400 });
    const { data: msg } = await supabase
      .from("direct_messages")
      .select("body, audio_path")
      .eq("id", messageId)
      .eq("athlete_id", athleteId)
      .maybeSingle();
    if (!msg) return NextResponse.json({ error: "Message not found" }, { status: 404 });
    notifyAthleteOfMessage(athleteId, {
      title: `${coach.name} reacted ${REACTION_EMOJI[reaction as "up" | "down"]}`,
      body: `To ${quoteForPush(msg.body ?? "", !!msg.audio_path)}`,
      url: `/a/${athlete.share_token}/community`,
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  notifyAthleteOfMessage(athleteId, {
    title: `${coach.name} sent a message`,
    body: text || "🎤 Voice note",
    url: `/a/${athlete.share_token}/community`,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}

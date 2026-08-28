import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { notifyAthleteOfMessage } from "@/lib/push/send";

// A coach's group-chat send goes straight through the browser client
// into group_messages (RLS covers it - GroupChat.tsx). Push is
// server-only code though, so this route exists purely to notify every
// athlete in the group after a successful send, same reasoning as
// /api/direct-messages/notify for the 1:1 case. Shares the
// notify_message preference with direct messages rather than getting
// its own toggle - both are "someone messaged me" notifications from a
// coach/athlete's point of view.
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
  const { groupId, groupName, text } = body;
  if (!groupId) return NextResponse.json({ error: "groupId required" }, { status: 400 });

  // Verify this group is actually in the coach's org (RLS already
  // enforced this for the message write; this route has none of its
  // own since it only sends push, no DB write).
  const { data: group } = await supabase.from("groups").select("id").eq("id", groupId).maybeSingle();
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const { data: members } = await supabase
    .from("group_members")
    .select("athlete_id, athletes(share_token)")
    .eq("group_id", groupId);

  const payload = {
    title: `${coach.name} sent a message${groupName ? ` in ${groupName}` : ""}`,
    body: text || "🎤 Voice note",
  };

  await Promise.all(
    (members ?? []).map((m: any) => {
      const token = Array.isArray(m.athletes) ? m.athletes[0]?.share_token : m.athletes?.share_token;
      return notifyAthleteOfMessage(m.athlete_id, { ...payload, url: token ? `/a/${token}/community` : undefined }).catch(() => {});
    })
  );

  return NextResponse.json({ ok: true });
}

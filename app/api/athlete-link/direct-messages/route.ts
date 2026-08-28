import { NextRequest, NextResponse } from "next/server";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { feedDisplayName } from "@/lib/feed-name";
import { notifyCoachesOfMessage } from "@/lib/push/send";

// Athlete side of the 1:1 direct-message thread with their coaches -
// mirrors app/api/athlete-link/chat/route.ts's shape, but there's no
// group to resolve: one thread per athlete, visible to every coach in
// the org.

// GET /api/athlete-link/direct-messages?token=xxx
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();
  const { data: messages, error } = await supabase
    .from("direct_messages")
    .select("*")
    .eq("athlete_id", athlete.id)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    messages: messages ?? [],
    athleteId: athlete.id,
    athleteName: feedDisplayName((athlete as any).name, (athlete as any).feed_first_name_only),
  });
}

// POST /api/athlete-link/direct-messages — athlete sends a message
// (text and/or a voice note, already uploaded via
// /api/athlete-link/chat-audio and referenced by its storage path).
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { token, message, audio_path, audio_duration_seconds } = body;
  const text = typeof message === "string" ? message.trim() : "";
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  if (!text && !audio_path) return NextResponse.json({ error: "Missing message" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();
  const senderName = feedDisplayName((athlete as any).name ?? "Athlete", (athlete as any).feed_first_name_only);

  const { data, error } = await supabase
    .from("direct_messages")
    .insert({
      organisation_id: (athlete as any).organisation_id,
      athlete_id: athlete.id,
      sender_type: "athlete",
      sender_id: athlete.id,
      sender_name: senderName,
      body: text,
      audio_path: audio_path || null,
      audio_duration_seconds: audio_duration_seconds ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  notifyCoachesOfMessage((athlete as any).organisation_id, {
    title: `${senderName} sent a message`,
    body: text || "🎤 Voice note",
    url: `/athletes/${athlete.id}`,
  }).catch(() => {});

  return NextResponse.json({ message: data });
}

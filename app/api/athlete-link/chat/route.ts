import { NextRequest, NextResponse } from "next/server";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { feedDisplayName } from "@/lib/feed-name";
import { notifyCoachesOfMessage } from "@/lib/push/send";

// GET — returns athlete's groups + messages for a given group
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const groupId = req.nextUrl.searchParams.get("group_id");

  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();

  // Get athlete's groups
  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, groups(id, name, colour)")
    .eq("athlete_id", athlete.id);

  const groups = (memberships ?? [])
    .map((m: any) => Array.isArray(m.groups) ? m.groups[0] : m.groups)
    .filter(Boolean);

  // Get messages for the requested group (or first group if none specified)
  const targetGroupId = groupId ?? groups[0]?.id;

  const displayName = feedDisplayName((athlete as any).name, (athlete as any).feed_first_name_only);

  if (!targetGroupId) {
    return NextResponse.json({ groups, messages: [], athleteId: athlete.id, athleteName: displayName });
  }

  // Verify athlete is a member of this group
  const isMember = groups.some((g: any) => g.id === targetGroupId);
  if (!isMember) {
    return NextResponse.json({ error: "Not a member of this group" }, { status: 403 });
  }

  const { data: messages, error } = await supabase
    .from("group_messages")
    .select("*")
    .eq("group_id", targetGroupId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    groups,
    messages: messages ?? [],
    athleteId: athlete.id,
    athleteName: displayName,
  });
}

// POST — athlete sends a message
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { token, group_id, message, audio_path, audio_duration_seconds } = body;
  const text = typeof message === "string" ? message.trim() : "";
  if (!token || !group_id || (!text && !audio_path)) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();

  // Verify athlete is a member of this group
  const { data: membership } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", group_id)
    .eq("athlete_id", athlete.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this group" }, { status: 403 });
  }

  const senderName = feedDisplayName((athlete as any).name ?? "Athlete", (athlete as any).feed_first_name_only);

  const { data, error } = await supabase
    .from("group_messages")
    .insert({
      group_id,
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
    title: `${senderName} sent a group message`,
    body: text || "🎤 Voice note",
    url: `/community`,
  }).catch(() => {});

  return NextResponse.json({ message: data });
}

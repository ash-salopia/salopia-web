import { NextRequest, NextResponse } from "next/server";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";

// Athlete-side voice-note upload for chat (group or direct) - mirrors
// app/api/chat-audio/route.ts but resolves identity from share_token
// instead of a Supabase Auth session, same convention as every other
// athlete-link route.

const FILE_SIZE_LIMIT = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const token = formData.get("token") as string | null;
  const file = formData.get("audio") as File | null;

  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  if (!file) return NextResponse.json({ error: "audio required" }, { status: 400 });
  if (file.size > FILE_SIZE_LIMIT) {
    return NextResponse.json({ error: "Voice note exceeds 10 MB limit" }, { status: 413 });
  }

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const ext = (file.type.split("/")[1] || "webm").split(";")[0];
  const storagePath = `${(athlete as any).organisation_id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  const service = createServiceRoleClient();
  const { error: uploadError } = await service.storage
    .from("chat-audio")
    .upload(storagePath, arrayBuffer, { contentType: file.type || "audio/webm", upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: `Storage error: ${uploadError.message}` }, { status: 500 });
  }

  return NextResponse.json({ path: storagePath });
}

import { NextResponse } from "next/server";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";

const FILE_SIZE_LIMIT = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// POST /api/athlete-link/avatar — athlete's own self-service upload.
// Athletes have no Supabase Auth session, so this uses the service
// role (bypassing storage RLS) and resolves the athlete from the
// token itself — the upload path is always built from that resolved
// id, never from anything in the request body, so a visitor can only
// ever overwrite their own avatar.
export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const token = formData.get("token") as string | null;
  const file = formData.get("file") as File | null;
  if (!token || !file) {
    return NextResponse.json({ error: "Missing token or file" }, { status: 400 });
  }

  if (file.size > FILE_SIZE_LIMIT) {
    return NextResponse.json({ error: "Image exceeds 5 MB limit" }, { status: 413 });
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, WEBP, or GIF images are allowed" }, { status: 415 });
  }

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `athlete/${athlete.id}/avatar.${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, arrayBuffer, { contentType: file.type, upsert: true });
  if (uploadError) {
    return NextResponse.json({ error: `Storage error: ${uploadError.message}` }, { status: 500 });
  }

  const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
  const avatarUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabase
    .from("athletes")
    .update({ avatar_url: avatarUrl })
    .eq("id", athlete.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, avatar_url: avatarUrl });
}

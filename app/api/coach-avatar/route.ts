import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase-service";

const FILE_SIZE_LIMIT = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
  );
}

// POST /api/coach-avatar — a coach's own profile picture.
// Anon-key/RLS uploads to Storage don't work reliably in this
// project (see app/api/documents/route.ts) — service role + a
// session-derived id, same pattern as documents.
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

  if (file.size > FILE_SIZE_LIMIT) {
    return NextResponse.json({ error: "Image exceeds 5 MB limit" }, { status: 413 });
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, WEBP, or GIF images are allowed" }, { status: 415 });
  }

  const service = createServiceRoleClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `coach/${user.id}/avatar.${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await service.storage
    .from("avatars")
    .upload(path, arrayBuffer, { contentType: file.type, upsert: true });
  if (uploadError) {
    return NextResponse.json({ error: `Storage error: ${uploadError.message}` }, { status: 500 });
  }

  const { data: publicUrlData } = service.storage.from("avatars").getPublicUrl(path);
  const avatarUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await service.from("coaches").update({ avatar_url: avatarUrl }).eq("id", user.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, avatar_url: avatarUrl });
}

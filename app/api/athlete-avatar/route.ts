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

// POST /api/athlete-avatar — a coach setting/changing an athlete's
// profile picture from the athlete's profile page. Service role +
// an explicit org-membership check (the athlete_id is client-supplied
// here, unlike the athlete-link routes, so this check is the actual
// security boundary — never trust it without it).
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: coach } = await supabase.from("coaches").select("organisation_id").eq("id", user.id).single();
  if (!coach) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  const formData = await req.formData();
  const athleteId = formData.get("athlete_id") as string | null;
  const file = formData.get("file") as File | null;
  if (!athleteId || !file) return NextResponse.json({ error: "athlete_id and file required" }, { status: 400 });

  if (file.size > FILE_SIZE_LIMIT) {
    return NextResponse.json({ error: "Image exceeds 5 MB limit" }, { status: 413 });
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, WEBP, or GIF images are allowed" }, { status: 415 });
  }

  const service = createServiceRoleClient();

  const { data: athlete } = await service.from("athletes").select("id, organisation_id").eq("id", athleteId).single();
  if (!athlete || athlete.organisation_id !== coach.organisation_id) {
    return NextResponse.json({ error: "Athlete not found" }, { status: 404 });
  }

  const ext = file.name.split(".").pop() || "jpg";
  const path = `athlete/${athleteId}/avatar.${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await service.storage
    .from("avatars")
    .upload(path, arrayBuffer, { contentType: file.type, upsert: true });
  if (uploadError) {
    return NextResponse.json({ error: `Storage error: ${uploadError.message}` }, { status: 500 });
  }

  const { data: publicUrlData } = service.storage.from("avatars").getPublicUrl(path);
  const avatarUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await service.from("athletes").update({ avatar_url: avatarUrl }).eq("id", athleteId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, avatar_url: avatarUrl });
}

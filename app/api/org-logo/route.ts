import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase-service";

const FILE_SIZE_LIMIT = 2 * 1024 * 1024; // 2 MB, matches the "max 2MB" copy in BrandingSettings.tsx
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml", "image/gif"]);

function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
  );
}

// POST /api/org-logo — the coach's organisation logo, shown top-left
// of the coach header (BrandingSettings.tsx, premium tier). Same
// service-role + session-derived-id pattern as /api/coach-avatar and
// /api/documents — direct anon-key/RLS uploads to Storage don't work
// reliably in this project. organisation_id is resolved from the
// authenticated coach's own row, never trusted from the client, so
// one coach can never write into another org's logo path.
// BrandingSettings.tsx isn't owner-gated (no role prop, unlike
// BillingSettings), so any coach in the org can replace the logo —
// this route doesn't add a stricter check than the UI already has.
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const service = createServiceRoleClient();
  const { data: coach } = await service.from("coaches").select("organisation_id").eq("id", user.id).single();
  if (!coach) return NextResponse.json({ error: "Coach not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

  if (file.size > FILE_SIZE_LIMIT) {
    return NextResponse.json({ error: "Image exceeds 2 MB limit" }, { status: 413 });
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, WEBP, GIF, or SVG images are allowed" }, { status: 415 });
  }

  const ext = file.name.split(".").pop() || "png";
  const path = `${coach.organisation_id}/logo.${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await service.storage
    .from("org-logos")
    .upload(path, arrayBuffer, { contentType: file.type, upsert: true });
  if (uploadError) {
    return NextResponse.json({ error: `Storage error: ${uploadError.message}` }, { status: 500 });
  }

  const { data: publicUrlData } = service.storage.from("org-logos").getPublicUrl(path);
  // Cache-bust — upsert overwrites the same filename on every
  // replace, so without this the browser/CDN can keep serving the
  // previous logo after a coach uploads a new one.
  const logoUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  return NextResponse.json({ ok: true, logo_url: logoUrl });
}

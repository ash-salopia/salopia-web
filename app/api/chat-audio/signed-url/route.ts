import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";

// Re-signs a fresh URL for a chat-audio storage path, callable from
// either side of a conversation: a coach (Supabase Auth session) or an
// athlete (share_token, athletes have no auth session). Paths are
// namespaced "${organisationId}/...", checked against the caller's own
// org before signing - not a precise per-thread ACL (an athlete could
// re-sign another athlete-in-the-same-org's voice note this way), but
// the actual access boundary is that a path can only ever be *learned*
// by first fetching messages the caller is already authorised to see
// (group membership / their own direct-message thread) - this is a
// coarse defense-in-depth check on top of that, not the primary one.
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  const token = req.nextUrl.searchParams.get("token");
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  let organisationId: string | null = null;

  if (token) {
    const athlete = await getAthleteByShareToken(token);
    if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    organisationId = (athlete as any).organisation_id;
  } else {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    const { data: coach } = await supabase.from("coaches").select("organisation_id").eq("id", user.id).single();
    if (!coach) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });
    organisationId = coach.organisation_id;
  }

  if (!organisationId || !path.startsWith(`${organisationId}/`)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const service = createServiceRoleClient();
  const { data, error } = await service.storage.from("chat-audio").createSignedUrl(path, 60 * 60);
  if (error || !data) return NextResponse.json({ error: "Could not generate URL" }, { status: 500 });

  return NextResponse.json({ url: data.signedUrl });
}

import { NextRequest, NextResponse } from "next/server";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";

// GET /api/athlete-link/documents?token=xxx — docs this athlete has
// access to. Must use the service-role client: an athlete has no
// Supabase Auth session, so the anon/RLS-scoped client this route used
// to use could never pass `organisation_id = my_organisation_id()` and
// silently returned zero rows for every athlete (see CLAUDE.md's
// athlete-link architecture note).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("document_athletes")
    .select("document:documents(id, title, doc_type, file_name, file_size, mime_type, video_url, notes, created_at)")
    .eq("athlete_id", athlete.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const documents = (data ?? [])
    .map((r: any) => r.document)
    .filter(Boolean)
    .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1));
  return NextResponse.json({ documents });
}

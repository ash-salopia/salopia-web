import { NextRequest, NextResponse } from "next/server";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";

// GET /api/athlete-link/documents/signed-url?token=xxx&id=xxx
// Service-role client throughout — see the note in ../route.ts. Access
// is verified via document_athletes membership (not a documents.athlete_id
// column, which no longer exists — a document can have many recipients).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const id = req.nextUrl.searchParams.get("id");
  if (!token || !id) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();

  const { data: access } = await supabase
    .from("document_athletes")
    .select("document:documents(file_path)")
    .eq("document_id", id)
    .eq("athlete_id", athlete.id)
    .maybeSingle();

  const filePath = (access?.document as any)?.file_path;
  if (!filePath) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase.storage
    .from("athlete-documents")
    .createSignedUrl(filePath, 60 * 60);

  if (error || !data) return NextResponse.json({ error: "Could not generate URL" }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}

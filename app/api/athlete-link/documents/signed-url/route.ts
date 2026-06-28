import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { createClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const id = req.nextUrl.searchParams.get("id");
  if (!token || !id) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = await createClient();

  // Verify this document belongs to this athlete
  const { data: doc } = await supabase
    .from("athlete_documents")
    .select("file_path, athlete_id")
    .eq("id", id)
    .eq("athlete_id", athlete.id)
    .single();

  if (!doc?.file_path) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const storageSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { get: () => undefined } }
  );

  const { data, error } = await storageSupabase.storage
    .from("athlete-documents")
    .createSignedUrl(doc.file_path, 60 * 60);

  if (error || !data) return NextResponse.json({ error: "Could not generate URL" }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}

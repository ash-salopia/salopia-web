import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// GET /api/documents/all — every document in the coach's org, with the
// athletes who currently have access to each one (for the Documents
// page list + its "by athlete"/"by group" filters).
export async function GET() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: coach } = await supabase
    .from("coaches")
    .select("organisation_id")
    .eq("id", user.id)
    .single();
  if (!coach) return NextResponse.json({ error: "Coach not found" }, { status: 403 });

  const { data, error } = await supabase
    .from("documents")
    .select("*, document_athletes(athlete:athletes(id, name))")
    .eq("organisation_id", coach.organisation_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const documents = (data ?? []).map((d: any) => {
    const athletes = (d.document_athletes ?? []).map((da: any) => da.athlete).filter(Boolean);
    const { document_athletes, ...doc } = d;
    return { ...doc, athletes, athlete_ids: athletes.map((a: any) => a.id) };
  });

  return NextResponse.json({ documents });
}

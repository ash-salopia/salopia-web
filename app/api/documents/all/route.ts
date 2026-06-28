import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

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
    .from("athlete_documents")
    .select("*, athlete:athletes(id, name)")
    .eq("organisation_id", coach.organisation_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data ?? [] });
}

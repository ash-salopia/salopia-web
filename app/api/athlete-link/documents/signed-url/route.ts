import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
  );

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // Fetch doc to get storage path
  const { data: doc } = await supabase
    .from("athlete_documents")
    .select("file_path")
    .eq("id", id)
    .single();

  if (!doc?.file_path) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const storageSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { get: () => undefined } }
  );

  const { data, error } = await storageSupabase.storage
    .from("athlete-documents")
    .createSignedUrl(doc.file_path, 60 * 60); // 1-hour URL for viewing

  if (error || !data) return NextResponse.json({ error: "Could not generate URL" }, { status: 500 });

  return NextResponse.json({ url: data.signedUrl });
}

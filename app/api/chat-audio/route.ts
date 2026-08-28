import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Coach-side voice-note upload for chat (group or direct) - stores the
// raw audio in the private chat-audio bucket and returns the storage
// path, same shape as app/api/documents/route.ts's file-upload path.
// The caller inserts the actual chat/direct-message row itself
// (unlike documents, which does both in one call) - a coach's browser
// client can already insert into group_messages/direct_messages
// directly via RLS, so this route's only job is the part the browser
// client genuinely can't do: writing to a private Storage bucket.

const FILE_SIZE_LIMIT = 10 * 1024 * 1024; // 10 MB - a voice note is short audio, not a real file upload

function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
  );
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: coach } = await supabase
    .from("coaches")
    .select("organisation_id")
    .eq("id", user.id)
    .single();
  if (!coach) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("audio") as File | null;
  if (!file) return NextResponse.json({ error: "audio required" }, { status: 400 });
  if (file.size > FILE_SIZE_LIMIT) {
    return NextResponse.json({ error: "Voice note exceeds 10 MB limit" }, { status: 413 });
  }

  const ext = (file.type.split("/")[1] || "webm").split(";")[0];
  const storagePath = `${coach.organisation_id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  // Anon key can't write to a private bucket - service role for the upload only.
  const storageSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { get: () => undefined } }
  );

  const { error: uploadError } = await storageSupabase.storage
    .from("chat-audio")
    .upload(storagePath, arrayBuffer, { contentType: file.type || "audio/webm", upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: `Storage error: ${uploadError.message}` }, { status: 500 });
  }

  return NextResponse.json({ path: storagePath });
}

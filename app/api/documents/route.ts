import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const FILE_SIZE_LIMIT = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword",                                                       // .doc
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       // .xlsx
  "application/vnd.ms-excel",                                                 // .xls
]);

function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
      },
    }
  );
}

// GET /api/documents?athlete_id=xxx  — list docs for an athlete
export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const athleteId = req.nextUrl.searchParams.get("athlete_id");
  if (!athleteId) return NextResponse.json({ error: "athlete_id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("athlete_documents")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data });
}

// POST /api/documents  — add a video link OR upload a file (multipart)
export async function POST(req: NextRequest) {
  const supabase = getSupabase();

  // Identify the calling coach
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: coach } = await supabase
    .from("coaches")
    .select("organisation_id")
    .eq("id", user.id)
    .single();
  if (!coach) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  const contentType = req.headers.get("content-type") ?? "";

  // ── Video link ──────────────────────────────────────────────────────────────
  if (contentType.includes("application/json")) {
    const body = await req.json();
    const { athlete_id, title, video_url, notes } = body;

    if (!athlete_id || !title || !video_url) {
      return NextResponse.json({ error: "athlete_id, title, video_url required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("athlete_documents")
      .insert({
        athlete_id,
        organisation_id: coach.organisation_id,
        created_by: user.id,
        title: title.trim(),
        doc_type: "video_link",
        video_url: video_url.trim(),
        notes: notes?.trim() || null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ document: data });
  }

  // ── File upload ─────────────────────────────────────────────────────────────
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const athlete_id = formData.get("athlete_id") as string;
    const title     = formData.get("title") as string;
    const notes     = formData.get("notes") as string | null;
    const file      = formData.get("file") as File | null;

    if (!athlete_id || !title || !file) {
      return NextResponse.json({ error: "athlete_id, title, file required" }, { status: 400 });
    }

    if (file.size > FILE_SIZE_LIMIT) {
      return NextResponse.json({ error: "File exceeds 10 MB limit" }, { status: 413 });
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Only PDF, Word (.docx/.doc), and Excel (.xlsx/.xls) files are allowed" }, { status: 415 });
    }

    // Upload to Supabase Storage (private bucket)
    const ext = file.name.split(".").pop() ?? "bin";
    const storagePath = `${coach.organisation_id}/${athlete_id}/${Date.now()}_${file.name}`;
    const arrayBuffer = await file.arrayBuffer();

    // Use service role for storage upload (anon key can't write to private buckets)
    const storageSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { get: () => undefined } }
    );

    const { error: uploadError } = await storageSupabase.storage
      .from("athlete-documents")
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: `Storage error: ${uploadError.message}` }, { status: 500 });
    }

    // Generate a signed URL (valid for 7 days; we refresh on read)
    const { data: signedData, error: signedError } = await storageSupabase.storage
      .from("athlete-documents")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

    if (signedError || !signedData) {
      return NextResponse.json({ error: "Could not generate file URL" }, { status: 500 });
    }

    // Insert record
    const { data, error } = await supabase
      .from("athlete_documents")
      .insert({
        athlete_id,
        organisation_id: coach.organisation_id,
        created_by: user.id,
        title: title.trim(),
        doc_type: "file",
        file_url: signedData.signedUrl,
        file_path: storagePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        notes: notes?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      // Clean up storage on DB failure
      await storageSupabase.storage.from("athlete-documents").remove([storagePath]);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ document: data });
  }

  return NextResponse.json({ error: "Unsupported content type" }, { status: 415 });
}

// DELETE /api/documents?id=xxx  — delete a document (and its storage file)
export async function DELETE(req: NextRequest) {
  const supabase = getSupabase();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Fetch the record first to get storage path
  const { data: doc, error: fetchError } = await supabase
    .from("athlete_documents")
    .select("file_path, doc_type")
    .eq("id", id)
    .single();

  if (fetchError || !doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  // Delete from DB
  const { error } = await supabase
    .from("athlete_documents")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Clean up storage file if it exists
  if (doc.doc_type === "file" && doc.file_path) {
    const storageSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { get: () => undefined } }
    );
    await storageSupabase.storage.from("athlete-documents").remove([doc.file_path]);
  }

  return NextResponse.json({ ok: true });
}

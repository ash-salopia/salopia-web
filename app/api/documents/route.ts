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

async function getSupabase() {
  const cookieStore = await cookies();
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

function getStorageClient() {
  // anon key can't write to a private bucket - service role for storage only
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { get: () => undefined } }
  );
}

// GET /api/documents?athlete_id=xxx — docs one athlete currently has access to
export async function GET(req: NextRequest) {
  const supabase = await getSupabase();
  const athleteId = req.nextUrl.searchParams.get("athlete_id");
  if (!athleteId) return NextResponse.json({ error: "athlete_id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("document_athletes")
    .select("document:documents(*)")
    .eq("athlete_id", athleteId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const documents = (data ?? [])
    .map((r: any) => r.document)
    .filter(Boolean)
    .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1));
  return NextResponse.json({ documents });
}

// Parses the recipient list a request was sent with. Accepts the new
// `athlete_ids` (JSON array, as a string in multipart form data) and,
// for callers that only ever target one athlete, a single `athlete_id`.
function parseAthleteIds(raw: { athlete_ids?: unknown; athlete_id?: unknown }): string[] {
  if (typeof raw.athlete_ids === "string") {
    try {
      const parsed = JSON.parse(raw.athlete_ids);
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
    } catch { /* fall through */ }
  }
  if (Array.isArray(raw.athlete_ids)) {
    return raw.athlete_ids.filter((x): x is string => typeof x === "string" && x.length > 0);
  }
  if (typeof raw.athlete_id === "string" && raw.athlete_id) return [raw.athlete_id];
  return [];
}

// POST /api/documents — add a video link OR upload a file (multipart),
// shared with one or more athletes at once. One document, one file
// upload, however many recipients — not one copy per athlete.
export async function POST(req: NextRequest) {
  const supabase = await getSupabase();

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
    const { title, video_url, notes } = body;
    const athleteIds = parseAthleteIds(body);

    if (!athleteIds.length || !title || !video_url) {
      return NextResponse.json({ error: "athlete_ids, title, video_url required" }, { status: 400 });
    }

    const { data: doc, error } = await supabase
      .from("documents")
      .insert({
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

    const { error: accessErr } = await supabase
      .from("document_athletes")
      .insert(athleteIds.map((athlete_id) => ({ document_id: doc.id, athlete_id })));
    if (accessErr) {
      await supabase.from("documents").delete().eq("id", doc.id);
      return NextResponse.json({ error: accessErr.message }, { status: 500 });
    }

    return NextResponse.json({ document: { ...doc, athlete_ids: athleteIds } });
  }

  // ── File upload ─────────────────────────────────────────────────────────────
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const title     = formData.get("title") as string;
    const notes     = formData.get("notes") as string | null;
    const file      = formData.get("file") as File | null;
    const athleteIds = parseAthleteIds({
      athlete_ids: formData.get("athlete_ids") as string | null ?? undefined,
      athlete_id: formData.get("athlete_id") as string | null ?? undefined,
    });

    if (!athleteIds.length || !title || !file) {
      return NextResponse.json({ error: "athlete_ids, title, file required" }, { status: 400 });
    }
    if (file.size > FILE_SIZE_LIMIT) {
      return NextResponse.json({ error: "File exceeds 10 MB limit" }, { status: 413 });
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Only PDF, Word (.docx/.doc), and Excel (.xlsx/.xls) files are allowed" }, { status: 415 });
    }

    // One storage object regardless of recipient count.
    const storagePath = `${coach.organisation_id}/${Date.now()}_${file.name}`;
    const arrayBuffer = await file.arrayBuffer();
    const storageSupabase = getStorageClient();

    const { error: uploadError } = await storageSupabase.storage
      .from("athlete-documents")
      .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: false });
    if (uploadError) {
      return NextResponse.json({ error: `Storage error: ${uploadError.message}` }, { status: 500 });
    }

    const { data: doc, error } = await supabase
      .from("documents")
      .insert({
        organisation_id: coach.organisation_id,
        created_by: user.id,
        title: title.trim(),
        doc_type: "file",
        file_path: storagePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        notes: notes?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      await storageSupabase.storage.from("athlete-documents").remove([storagePath]);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { error: accessErr } = await supabase
      .from("document_athletes")
      .insert(athleteIds.map((athlete_id) => ({ document_id: doc.id, athlete_id })));
    if (accessErr) {
      await supabase.from("documents").delete().eq("id", doc.id);
      await storageSupabase.storage.from("athlete-documents").remove([storagePath]);
      return NextResponse.json({ error: accessErr.message }, { status: 500 });
    }

    return NextResponse.json({ document: { ...doc, athlete_ids: athleteIds } });
  }

  return NextResponse.json({ error: "Unsupported content type" }, { status: 415 });
}

// PATCH /api/documents?id=xxx  { athlete_ids: string[] } — replace who
// has access to a document. Doesn't touch the document/file itself.
export async function PATCH(req: NextRequest) {
  const supabase = await getSupabase();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const athleteIds = parseAthleteIds(body ?? {});
  if (!athleteIds.length) {
    return NextResponse.json({ error: "At least one athlete must have access" }, { status: 400 });
  }

  const { error: delErr } = await supabase.from("document_athletes").delete().eq("document_id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const { error: insErr } = await supabase
    .from("document_athletes")
    .insert(athleteIds.map((athlete_id) => ({ document_id: id, athlete_id })));
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, athlete_ids: athleteIds });
}

// DELETE /api/documents?id=xxx  — delete a document (and its storage file)
export async function DELETE(req: NextRequest) {
  const supabase = await getSupabase();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: doc, error: fetchError } = await supabase
    .from("documents")
    .select("file_path, doc_type")
    .eq("id", id)
    .single();
  if (fetchError || !doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  // document_athletes rows cascade with the document row.
  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (doc.doc_type === "file" && doc.file_path) {
    await getStorageClient().storage.from("athlete-documents").remove([doc.file_path]);
  }

  return NextResponse.json({ ok: true });
}

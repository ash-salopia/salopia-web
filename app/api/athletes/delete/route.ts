import { NextRequest, NextResponse } from "next/server";
import { getAthleteDeleteAccess } from "@/lib/athlete-delete-access";
import { verifyDeletePassword } from "@/lib/delete-password";

export const dynamic = "force-dynamic";

// GET: what the delete UI should show for the calling coach.
export async function GET() {
  const access = await getAthleteDeleteAccess();
  if (!access) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({
    canDelete: access.canDelete,
    isOwner: access.isOwner,
    passwordSet: !!access.passwordHash,
  });
}

// POST { ids: string[], password } or { importBatchId, password }.
// The only way to permanently delete athletes since 0114 dropped the
// browser-side delete policy. Deleting cascades to sessions, PBs, tests.
export async function POST(req: NextRequest) {
  const access = await getAthleteDeleteAccess();
  if (!access) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { supabase, service, coach, canDelete, passwordHash } = access;

  if (!canDelete) {
    return NextResponse.json(
      { error: "Only the organisation owner can delete athletes. Archive them instead, or ask the owner." },
      { status: 403 }
    );
  }
  if (!passwordHash) {
    return NextResponse.json(
      { error: "No delete password has been set yet. The owner needs to set one in Settings → Athlete deletion." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  if (!(await verifyDeletePassword(password, passwordHash))) {
    return NextResponse.json({ error: "Incorrect delete password." }, { status: 403 });
  }

  const importBatchId = typeof body.importBatchId === "string" ? body.importBatchId : null;
  let ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];

  if (importBatchId) {
    const { data: batch } = await service
      .from("import_batches")
      .select("id, entity, status, organisation_id")
      .eq("id", importBatchId)
      .maybeSingle();
    if (!batch || batch.organisation_id !== coach.organisation_id) {
      return NextResponse.json({ error: "Import not found." }, { status: 404 });
    }
    if (batch.status === "reverted") {
      return NextResponse.json({ error: "This import has already been reverted." }, { status: 400 });
    }
    if (batch.entity !== "athletes") {
      return NextResponse.json({ error: "Only roster imports can be reverted here." }, { status: 400 });
    }
    // Read through the coach's own (RLS) client so they can only remove
    // athletes they could already see - same rule the old delete policy used.
    const { data: rows, error } = await supabase.from("athletes").select("id").eq("import_batch_id", importBatchId);
    if (error) return NextResponse.json({ error: "Could not load the imported athletes." }, { status: 500 });
    ids = (rows ?? []).map((r) => r.id);
  } else {
    if (!ids.length) return NextResponse.json({ error: "No athletes selected." }, { status: 400 });
    const { data: rows, error } = await supabase.from("athletes").select("id").in("id", ids);
    if (error) return NextResponse.json({ error: "Could not load those athletes." }, { status: 500 });
    if ((rows ?? []).length !== new Set(ids).size) {
      return NextResponse.json({ error: "Athlete not found." }, { status: 404 });
    }
  }

  if (ids.length) {
    const { error } = await service
      .from("athletes")
      .delete()
      .in("id", ids)
      .eq("organisation_id", coach.organisation_id);
    if (error) {
      console.error("[athletes/delete]", error);
      return NextResponse.json({ error: "Could not delete. Nothing was changed." }, { status: 500 });
    }
  }

  if (importBatchId) {
    await service
      .from("import_batches")
      .update({ status: "reverted", reverted_at: new Date().toISOString() })
      .eq("id", importBatchId)
      .eq("organisation_id", coach.organisation_id);
  }

  return NextResponse.json({ deleted: ids.length });
}

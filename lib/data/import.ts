import { createClient } from "@/lib/supabase-browser";
import type { RosterRow } from "@/lib/import/roster";

// Data layer for the customer-migration tooling. Coach-authenticated
// (browser client, RLS-scoped to the coach's own org — same pattern as
// every other lib/data/*.ts). The roster commit is one bulk insert so
// the seat-limit trigger (0030) either lets the whole file through or
// rejects it atomically, never a half-import.

export interface ImportBatch {
  id: string;
  entity: "athletes" | "library" | "pbs" | "test_results" | "sessions" | "body_metrics";
  source_label: string | null;
  filename: string | null;
  row_count: number;
  created_count: number;
  skipped_count: number;
  status: "complete" | "reverted";
  created_at: string;
  reverted_at: string | null;
}

async function myOrgId(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data, error } = await supabase.from("coaches").select("organisation_id").eq("id", user.id).single();
  if (error || !data) throw new Error("No coach profile found");
  return data.organisation_id;
}

// How many more active athletes this org can take, or null for
// unlimited. Lets the importer block a too-big file up front with a
// clear message rather than letting the DB trigger fail mid-insert.
export async function getRemainingSeats(): Promise<number | null> {
  const supabase = createClient();
  const orgId = await myOrgId(supabase);
  const { data: org } = await supabase.from("organisations").select("seat_limit").eq("id", orgId).single();
  const limit = org?.seat_limit ?? null;
  if (limit == null) return null;
  const { count } = await supabase
    .from("athletes")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", orgId)
    .eq("archived", false);
  return Math.max(0, limit - (count ?? 0));
}

export interface RosterImportResult {
  batchId: string;
  created: number;
}

export async function commitRosterImport(
  rows: RosterRow[],
  meta: { sourceLabel?: string; filename?: string }
): Promise<RosterImportResult> {
  if (!rows.length) throw new Error("Nothing to import.");
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const orgId = await myOrgId(supabase);

  const remaining = await getRemainingSeats();
  if (remaining != null && rows.length > remaining) {
    throw new Error(
      `This file has ${rows.length} athletes but your plan has only ${remaining} seat${remaining === 1 ? "" : "s"} left. ` +
      `Archive some athletes or contact support to raise your limit, then try again.`
    );
  }

  const { data: batch, error: batchErr } = await supabase
    .from("import_batches")
    .insert({
      organisation_id: orgId,
      created_by: user.id,
      entity: "athletes",
      source_label: meta.sourceLabel?.trim() || null,
      filename: meta.filename?.slice(0, 200) ?? null,
      row_count: rows.length,
    })
    .select("id")
    .single();
  if (batchErr || !batch) throw new Error("Could not start the import. Please try again.");

  const payload = rows.map((r) => ({
    organisation_id: orgId,
    import_batch_id: batch.id,
    name: r.name,
    group: r.group || "",
    sex: r.sex,
    date_of_birth: r.date_of_birth,
    bodyweight_kg: r.bodyweight_kg,
    max_hr: r.max_hr,
    resting_hr: r.resting_hr,
    mas_kmh: r.mas_kmh,
  }));

  const { data: created, error: insErr } = await supabase
    .from("athletes")
    .insert(payload)
    .select("id");

  if (insErr || !created) {
    // Roll the batch back so a failed attempt leaves nothing behind.
    await supabase.from("import_batches").delete().eq("id", batch.id);
    if (insErr?.message.includes("SEAT_LIMIT_REACHED")) {
      throw new Error("You've hit your plan's athlete limit part-way through — nothing was imported. Free up seats and retry.");
    }
    throw new Error("The import failed and nothing was created. Please try again.");
  }

  // Assign every new athlete to the importing coach (same reasoning as
  // createAthlete — makes them visible to a restricted coach with no
  // separate step). Best-effort.
  await supabase.from("coach_athletes").insert(
    created.map((a) => ({ coach_id: user.id, athlete_id: a.id }))
  );

  await supabase
    .from("import_batches")
    .update({ created_count: created.length })
    .eq("id", batch.id);

  return { batchId: batch.id, created: created.length };
}

// ── History + revert ────────────────────────────────────────────────

export async function listImportBatches(): Promise<ImportBatch[]> {
  const supabase = createClient();
  const orgId = await myOrgId(supabase);
  const { data, error } = await supabase
    .from("import_batches")
    .select("*")
    .eq("organisation_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface RevertImpact {
  athletes: number;
  sessions: number;
  personalBests: number;
  testSessions: number;
}

// What a revert of an athletes batch would remove — the athletes plus
// everything that's been logged against them since (all cascade on
// athlete delete). Shown in the confirm dialog.
export async function getRosterRevertImpact(batchId: string): Promise<RevertImpact> {
  const supabase = createClient();
  const { data: ath } = await supabase
    .from("athletes")
    .select("id")
    .eq("import_batch_id", batchId);
  const ids = (ath ?? []).map((a) => a.id);
  if (!ids.length) return { athletes: 0, sessions: 0, personalBests: 0, testSessions: 0 };

  const [{ count: sessions }, { count: pbs }, { count: tests }] = await Promise.all([
    supabase.from("sessions").select("id", { count: "exact", head: true }).in("athlete_id", ids),
    supabase.from("personal_bests").select("id", { count: "exact", head: true }).in("athlete_id", ids),
    supabase.from("test_sessions").select("id", { count: "exact", head: true }).in("athlete_id", ids),
  ]);

  return {
    athletes: ids.length,
    sessions: sessions ?? 0,
    personalBests: pbs ?? 0,
    testSessions: tests ?? 0,
  };
}

export async function revertRosterImport(batchId: string): Promise<void> {
  const supabase = createClient();
  const orgId = await myOrgId(supabase);

  const { data: batch } = await supabase
    .from("import_batches")
    .select("id, entity, status, organisation_id")
    .eq("id", batchId)
    .single();
  if (!batch || batch.organisation_id !== orgId) throw new Error("Import not found.");
  if (batch.status === "reverted") throw new Error("This import has already been reverted.");
  if (batch.entity !== "athletes") throw new Error("Only roster imports can be reverted here.");

  // Deleting the athletes cascades to sessions / PBs / test sessions / etc.
  const { error: delErr } = await supabase.from("athletes").delete().eq("import_batch_id", batchId);
  if (delErr) throw new Error("Could not remove the imported athletes. Nothing was changed.");

  await supabase
    .from("import_batches")
    .update({ status: "reverted", reverted_at: new Date().toISOString() })
    .eq("id", batchId);
}

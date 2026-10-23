import { createClient } from "@/lib/supabase-browser";
import type { FieldMapping, PlannedSession } from "@/lib/import/test-results";

// Saving side of the testing results import (lib/import/test-results.ts
// does the parsing). RLS on test_sessions / test_results / 0129's
// test_import_mappings scopes everything to the coach's organisation.

export async function getImportMappings(): Promise<Record<string, FieldMapping>> {
  const supabase = createClient();
  const { data, error } = await supabase.from("test_import_mappings").select("source_key, test_metric_id, side, scale");
  if (error) {
    // Migration 0129 not run yet - import still works, just without memory.
    if (/test_import_mappings/.test(error.message)) return {};
    throw error;
  }
  const out: Record<string, FieldMapping> = {};
  for (const r of data ?? []) {
    out[r.source_key] = { metricId: r.test_metric_id, side: r.side, scale: Number(r.scale) || 1 };
  }
  return out;
}

export async function saveImportMappings(mappings: Record<string, FieldMapping>): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: coach } = await supabase.from("coaches").select("organisation_id").eq("id", user?.id).single();
  if (!coach?.organisation_id) return;
  const rows = Object.entries(mappings).map(([source_key, m]) => ({
    organisation_id: coach.organisation_id,
    source_key,
    test_metric_id: m.metricId,
    side: m.side,
    scale: m.scale || 1,
    updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from("test_import_mappings")
      .upsert(rows.slice(i, i + 500), { onConflict: "organisation_id,source_key" });
    if (error && !/test_import_mappings/.test(error.message)) throw error;
  }
}

export interface ImportCommitResult {
  created: number;
  updated: number;
  results: number;
}

// One test session per athlete per date. If the athlete already has an
// individual (non-group) session that day, the import adds to it -
// replacing only the metrics/sides in the file, like re-entering them
// by hand - so importing the same export twice doesn't duplicate.
export async function commitTestImport(
  sessions: PlannedSession[],
  testBatteryId: string | null
): Promise<ImportCommitResult> {
  const supabase = createClient();
  const athleteIds = [...new Set(sessions.map((s) => s.athleteId))];
  const dates = [...new Set(sessions.map((s) => s.date))];

  const { data: existing, error: exErr } = await supabase
    .from("test_sessions")
    .select("id, athlete_id, date, bodyweight_kg, group_test_session_id")
    .in("athlete_id", athleteIds)
    .in("date", dates)
    .is("group_test_session_id", null);
  if (exErr) throw exErr;
  const existingByKey = new Map<string, { id: string; bodyweight_kg: number | null }>();
  for (const e of existing ?? []) existingByKey.set(`${e.athlete_id}|${e.date}`, e);

  let created = 0;
  let updated = 0;
  let results = 0;

  // Create the missing sessions in one go.
  const toCreate = sessions.filter((s) => !existingByKey.has(`${s.athleteId}|${s.date}`));
  if (toCreate.length) {
    const { data: inserted, error } = await supabase
      .from("test_sessions")
      .insert(toCreate.map((s) => ({
        athlete_id: s.athleteId,
        test_battery_id: testBatteryId,
        date: s.date,
        bodyweight_kg: s.bodyweightKg,
        notes: "Imported",
      })))
      .select("id, athlete_id, date, bodyweight_kg");
    if (error) throw error;
    for (const r of inserted ?? []) existingByKey.set(`${r.athlete_id}|${r.date}`, r);
    created = inserted?.length ?? 0;
  }

  for (const s of sessions) {
    const session = existingByKey.get(`${s.athleteId}|${s.date}`);
    if (!session) continue;
    const isNew = toCreate.includes(s);
    if (!isNew) {
      updated++;
      if (session.bodyweight_kg == null && s.bodyweightKg != null) {
        await supabase.from("test_sessions").update({ bodyweight_kg: s.bodyweightKg }).eq("id", session.id);
      }
      // Replace just the metric/side combinations being imported.
      for (const r of s.results) {
        let del = supabase.from("test_results").delete().eq("test_session_id", session.id).eq("test_metric_id", r.metricId);
        del = r.side ? del.eq("side", r.side) : del.is("side", null);
        const { error } = await del;
        if (error) throw error;
      }
    }
    const rows = s.results.flatMap((r) =>
      r.values.map((value, i) => ({
        test_session_id: session.id,
        test_metric_id: r.metricId,
        side: r.side,
        trial_number: i + 1,
        value,
      }))
    );
    if (rows.length) {
      const { error } = await supabase.from("test_results").insert(rows);
      if (error) throw error;
      results += rows.length;
    }
  }

  return { created, updated, results };
}

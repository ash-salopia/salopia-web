import { createClient } from "@/lib/supabase-browser";
import { getMyOrganisationId } from "@/lib/data/athletes";
import type { ReportOptions } from "@/lib/report-options";

// "athlete" = the Reporting tab's Athlete Reports form (ReportOptions).
// "squad" = the Squad Report tab's config (see SquadPresetOptions in
// reporting/page.tsx) - a different shape, stored in the same jsonb
// column, kept apart only by `kind` (see 0059_squad_report_presets.sql)
// so both forms can reuse one table/UI pattern instead of duplicating it.
export type PresetKind = "athlete" | "squad";

export interface ReportPreset<T = ReportOptions> {
  id: string;
  organisation_id: string;
  kind: PresetKind;
  name: string;
  options: T;
  created_at: string;
}

export async function listReportPresets<T = ReportOptions>(kind: PresetKind = "athlete"): Promise<ReportPreset<T>[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("report_presets")
    .select("*")
    .eq("kind", kind)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Upsert on (organisation_id, kind, name) - reusing an existing name
// (within the same kind) updates that preset in place rather than
// accumulating duplicates, matching how a coach would expect "save"
// to behave.
export async function saveReportPreset<T = ReportOptions>(kind: PresetKind, name: string, options: T): Promise<ReportPreset<T>> {
  const supabase = createClient();
  const organisation_id = await getMyOrganisationId();
  const { data, error } = await supabase
    .from("report_presets")
    .upsert({ organisation_id, kind, name, options }, { onConflict: "organisation_id,kind,name" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteReportPreset(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("report_presets").delete().eq("id", id);
  if (error) throw error;
}

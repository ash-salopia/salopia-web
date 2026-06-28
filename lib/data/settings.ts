import { createClient } from "@/lib/supabase-browser";
import type { OneRMFormula, WeightUnit } from "@/lib/one-rm";
import { DEFAULT_CHECKIN_RULES, type CheckInRules } from "@/lib/checkin";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrgSettings {
  one_rm_formula: OneRMFormula;
  weight_unit: WeightUnit;
  checkin_enabled: boolean;
  checkin_rules: CheckInRules;
  hyrox_enabled: boolean;
}

export const DEFAULT_SETTINGS: OrgSettings = {
  one_rm_formula: "lander",
  weight_unit: "kg",
  checkin_enabled: true,
  checkin_rules: DEFAULT_CHECKIN_RULES,
  hyrox_enabled: true,
};

// ── Coach-side (uses authenticated client) ────────────────────────────────────

export async function getOrgSettings(): Promise<OrgSettings> {
  const supabase = createClient();
  const { data: coach } = await supabase
    .from("coaches")
    .select("organisation_id")
    .single();
  if (!coach) return DEFAULT_SETTINGS;

  const { data: org } = await supabase
    .from("organisations")
    .select("settings")
    .eq("id", coach.organisation_id)
    .single();

  return { ...DEFAULT_SETTINGS, ...(org?.settings ?? {}) };
}

export async function updateOrgSettings(patch: Partial<OrgSettings>): Promise<void> {
  const supabase = createClient();
  const { data: coach } = await supabase
    .from("coaches")
    .select("organisation_id")
    .single();
  if (!coach) throw new Error("No coach profile found");

  const { data: org } = await supabase
    .from("organisations")
    .select("settings")
    .eq("id", coach.organisation_id)
    .single();

  const merged = { ...DEFAULT_SETTINGS, ...(org?.settings ?? {}), ...patch };

  const { error } = await supabase
    .from("organisations")
    .update({ settings: merged })
    .eq("id", coach.organisation_id);

  if (error) throw error;
}

// Note: getOrgSettingsForAthlete (service role version) lives in
// app/api/athlete-link/goals/route.ts to avoid importing server-only
// packages into client components.

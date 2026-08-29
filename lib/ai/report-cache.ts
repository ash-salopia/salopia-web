// Dedup layer for the paid AI report/summary routes. A coach who
// re-opens, re-prints, or bulk-re-exports a report with no new data
// underneath should not trigger a second model call.
//
// The `reports` table (0005, extended in 0081) is the store. RLS on it
// already scopes every row to the coach's org via athlete → organisation,
// so these helpers just take the request's RLS server client.
//
// Freshness key is a hash of the EXACT data that feeds the prompt, not a
// timestamp — session_exercises has no updated_at and set-logging never
// bumps sessions.updated_at, so a timestamp key would go stale silently.

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ReportType = "training_load" | "testing";

// Stable stringify: object keys sorted recursively so the same data
// always hashes the same regardless of property order.
function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
}

export function fingerprintReportInput(payload: unknown): string {
  return createHash("sha256").update(canonical(payload)).digest("hex");
}

export async function getCachedReport(
  supabase: SupabaseClient,
  params: { athleteId: string; reportType: ReportType; hash: string }
): Promise<unknown | null> {
  const { data } = await supabase
    .from("reports")
    .select("content")
    .eq("athlete_id", params.athleteId)
    .eq("report_type", params.reportType)
    .eq("input_hash", params.hash)
    .not("content", "is", null)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.content ?? null;
}

export async function putCachedReport(
  supabase: SupabaseClient,
  params: {
    athleteId: string;
    reportType: ReportType;
    hash: string;
    model: string;
    content: unknown;
    rangeStart?: string | null;
    rangeEnd?: string | null;
  }
): Promise<void> {
  // Keep one cache row per (athlete, type, hash): clear any stale entry
  // for this exact input first, then insert. Rows for other hashes/types
  // (i.e. the report history) are left alone.
  await supabase
    .from("reports")
    .delete()
    .eq("athlete_id", params.athleteId)
    .eq("report_type", params.reportType)
    .eq("input_hash", params.hash);

  await supabase.from("reports").insert({
    athlete_id: params.athleteId,
    report_type: params.reportType,
    input_hash: params.hash,
    model: params.model,
    content: params.content,
    range_start: params.rangeStart ?? null,
    range_end: params.rangeEnd ?? null,
  });
}

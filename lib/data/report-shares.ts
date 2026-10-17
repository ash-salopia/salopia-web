import { createClient } from "@/lib/supabase-browser";
import type { ReportOptions } from "@/lib/report-options";

// Coach-side reads/writes for shared Training Reports (0122/0123) and
// per-athlete report schedules (0123). RLS scopes both to athletes the
// coach can access.

export interface SharedReportRow {
  id: string;
  title: string;
  range_label?: string;
  emailed_to: string[];
  emailed_at: string | null;
  created_at: string;
  expires_at: string;
  revoked_at?: string | null;
  visible_to_athlete?: boolean;
  style?: string;
}

export async function listSharedReports(athleteId: string, limit = 15): Promise<SharedReportRow[]> {
  const supabase = createClient();
  // Falls back to the 0122 columns if 0123 hasn't been run yet.
  const { data, error } = await supabase
    .from("shared_reports")
    .select("id, title, emailed_to, emailed_at, created_at, expires_at, range_label, revoked_at, visible_to_athlete, style")
    .eq("athlete_id", athleteId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    const { data: basic } = await supabase
      .from("shared_reports")
      .select("id, title, emailed_to, emailed_at, created_at, expires_at")
      .eq("athlete_id", athleteId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return (basic ?? []) as SharedReportRow[];
  }
  return (data ?? []) as SharedReportRow[];
}

/** Withdraw a shared link - /r/<id> stops working and it leaves the athlete app. */
export async function revokeSharedReport(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("shared_reports").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export interface ReportSchedule {
  id: string;
  athlete_id: string;
  every_weeks: number;
  next_due: string;
  options: Partial<ReportOptions>;
  active: boolean;
  last_reminded_at: string | null;
  last_sent_at: string | null;
}

export async function getReportSchedule(athleteId: string): Promise<ReportSchedule | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from("report_schedules").select("*").eq("athlete_id", athleteId).maybeSingle();
  if (error) return null; // 0123 not run yet
  return data as ReportSchedule | null;
}

export async function saveReportSchedule(params: {
  athleteId: string;
  everyWeeks: number;
  nextDue: string;
  options: ReportOptions;
  active: boolean;
}): Promise<ReportSchedule> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data: coach } = await supabase.from("coaches").select("organisation_id").eq("id", user.id).single();
  if (!coach) throw new Error("Coach profile not found");
  // Free-text AI context is per report, not something to repeat forever.
  const { coachContext: _drop, ...options } = params.options;
  const { data, error } = await supabase
    .from("report_schedules")
    .upsert(
      {
        organisation_id: coach.organisation_id,
        athlete_id: params.athleteId,
        created_by: user.id,
        every_weeks: params.everyWeeks,
        next_due: params.nextDue,
        options,
        active: params.active,
      },
      { onConflict: "athlete_id" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as ReportSchedule;
}

/** After a scheduled report is sent: record it and roll the due date on. */
export async function markScheduledReportSent(athleteId: string): Promise<void> {
  const supabase = createClient();
  const { data: sched } = await supabase.from("report_schedules").select("id, every_weeks, next_due").eq("athlete_id", athleteId).maybeSingle();
  if (!sched) return;
  const today = new Date().toISOString().slice(0, 10);
  let next = sched.next_due as string;
  while (next <= today) {
    const d = new Date(next + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 7 * (sched.every_weeks as number));
    next = d.toISOString().slice(0, 10);
  }
  await supabase.from("report_schedules").update({ last_sent_at: new Date().toISOString(), next_due: next }).eq("id", sched.id);
}

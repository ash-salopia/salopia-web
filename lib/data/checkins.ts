import { createClient } from "@/lib/supabase-browser";
import { todayISO } from "@/lib/date-utils";
import type { CheckIn } from "@/types";

export interface CheckInRow extends CheckIn {
  athlete?: { id: string; name: string } | null;
}

// Every check-in submitted today, org-wide — the dashboard filters
// these down to the ones worth flagging via lib/checkin.ts's
// flaggedConditions (same thresholds/rules the athlete's own
// suggestions are built from). Archived athletes are excluded (inner
// join + athlete.archived filter) so they drop off the dashboard the
// same way they drop out of listAthletes().
export async function listTodayCheckIns(): Promise<CheckInRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("checkins")
    .select("*, athlete:athletes!inner(id, name)")
    .eq("date", todayISO())
    .eq("athlete.archived", false);
  if (error) throw error;
  return data ?? [];
}

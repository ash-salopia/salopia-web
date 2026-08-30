import { createClient } from "@/lib/supabase-browser";
import type { DirectMessage } from "@/types";

export interface RecentDirectMessage extends DirectMessage {
  athlete?: { id: string; name: string } | null;
}

// Most recent messages sent BY athletes (not coach replies) across the
// whole org - direct_messages has no read/unread tracking (0077), so
// this is a "who's reached out lately" feed rather than a true unread
// count. Used by the dashboard's "Athlete messages" panel.
export async function listRecentAthleteMessages(limit = 8): Promise<RecentDirectMessage[]> {
  const supabase = createClient();
  // Over-fetch and drop acknowledged rows in JS rather than filtering on
  // acknowledged_at in the query — that keeps working even if migration
  // 0084 hasn't been applied yet (the field just reads as undefined).
  const { data, error } = await supabase
    .from("direct_messages")
    .select("*, athlete:athletes!inner(id, name)")
    .eq("sender_type", "athlete")
    .eq("athlete.archived", false)
    .order("created_at", { ascending: false })
    .limit(limit * 4);
  if (error) throw error;
  return (data ?? [])
    .filter((m) => !(m as RecentDirectMessage).acknowledged_at)
    .slice(0, limit);
}

// Clear one athlete message off the Dashboard's "Athlete messages"
// panel (0084). Throws if the column is missing so the caller can roll
// back its optimistic removal.
export async function acknowledgeAthleteMessage(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("direct_messages")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// Clear every outstanding athlete message from one athlete — used when
// a coach replies from the Dashboard pop-up (replying = handled).
export async function acknowledgeAthleteMessagesFor(athleteId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("direct_messages")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("athlete_id", athleteId)
    .eq("sender_type", "athlete");
  if (error) throw error;
}

// The tail of one athlete's direct-message thread (both directions),
// newest last - used by the athlete-page Dashboard tab's Messages
// column as a read-only preview that opens the full thread on click.
export async function listAthleteMessages(athleteId: string, limit = 8): Promise<DirectMessage[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("direct_messages")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).slice().reverse();
}

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
  const { data, error } = await supabase
    .from("direct_messages")
    .select("*, athlete:athletes!inner(id, name)")
    .eq("sender_type", "athlete")
    .eq("athlete.archived", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

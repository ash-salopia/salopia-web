import { createClient } from "@/lib/supabase-browser";

export interface Announcement {
  id: string;
  organisation_id: string;
  coach_id: string;
  group_id: string | null;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  group?: { id: string; name: string } | null;
  coach?: { name: string } | null;
}

export async function listAnnouncements(groupId?: string): Promise<Announcement[]> {
  const supabase = createClient();
  let query = supabase
    .from("announcements")
    .select("*, group:groups(id, name), coach:coaches(name)")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (groupId) {
    // Group-specific + org-wide (group_id null)
    query = query.or(`group_id.eq.${groupId},group_id.is.null`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createAnnouncement(input: {
  title: string;
  body: string;
  groupId: string | null;
  pinned?: boolean;
}): Promise<Announcement> {
  const supabase = createClient();

  const { data: coach, error: coachErr } = await supabase
    .from("coaches")
    .select("id, organisation_id")
    .single();
  if (coachErr) throw coachErr;

  const { data, error } = await supabase
    .from("announcements")
    .insert({
      title: input.title.trim(),
      body: input.body.trim(),
      group_id: input.groupId,
      pinned: input.pinned ?? false,
      coach_id: coach.id,
      organisation_id: coach.organisation_id,
    })
    .select("*, group:groups(id, name), coach:coaches(name)")
    .single();
  if (error) throw error;
  return data;
}

export async function updateAnnouncement(
  id: string,
  updates: Partial<Pick<Announcement, "title" | "body" | "pinned">>
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("announcements")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) throw error;
}

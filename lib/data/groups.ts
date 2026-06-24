import { createClient } from "@/lib/supabase-browser";

export interface Group {
  id: string;
  organisation_id: string;
  name: string;
  description: string;
  colour: string;
  created_at: string;
  member_count?: number;
}

export interface GroupMember {
  id: string;
  group_id: string;
  athlete_id: string;
  joined_at: string;
  athlete?: {
    id: string;
    name: string;
  };
}

// ── Groups ────────────────────────────────────────────────────────────────────

export async function listGroups(): Promise<Group[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("groups")
    .select("*, group_members(count)")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((g: any) => ({
    ...g,
    member_count: g.group_members?.[0]?.count ?? 0,
  }));
}

export async function createGroup(
  name: string,
  description = "",
  colour = "#4a9eff"
): Promise<Group> {
  const supabase = createClient();
  // Get org id from coaches table
  const { data: coach, error: coachErr } = await supabase
    .from("coaches")
    .select("organisation_id")
    .single();
  if (coachErr) throw coachErr;

  const { data, error } = await supabase
    .from("groups")
    .insert({ name, description, colour, organisation_id: coach.organisation_id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateGroup(
  id: string,
  updates: Partial<Pick<Group, "name" | "description" | "colour">>
): Promise<Group> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("groups")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteGroup(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("groups").delete().eq("id", id);
  if (error) throw error;
}

// ── Group members ─────────────────────────────────────────────────────────────

export async function listGroupMembers(groupId: string): Promise<GroupMember[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("group_members")
    .select("*, athlete:athletes(id, name)")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addGroupMember(
  groupId: string,
  athleteId: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("group_members")
    .insert({ group_id: groupId, athlete_id: athleteId });
  // Ignore duplicate — idempotent
  if (error && !error.message.includes("duplicate")) throw error;
}

export async function removeGroupMember(
  groupId: string,
  athleteId: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("athlete_id", athleteId);
  if (error) throw error;
}

export async function getAthleteGroups(athleteId: string): Promise<Group[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("group_members")
    .select("group:groups(*)")
    .eq("athlete_id", athleteId);
  if (error) throw error;
  return (data ?? []).map((row: any) => row.group).filter(Boolean);
}

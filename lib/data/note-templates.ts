import { createClient } from "@/lib/supabase-browser";

export type NoteCategory = "warm_up" | "cool_down" | "strength" | "power_speed" | "cardio" | "hyrox" | "sport" | "recovery";

export interface NoteTemplate {
  id: string;
  organisation_id: string;
  name: string;
  content: string;
  // 0107 — was a single category; a note is often relevant to more than
  // one session type (e.g. a generic mobility warm-up fits Strength AND
  // Power/Speed), so this is a tag array. 0109 — the "general"/
  // show-everywhere option was removed; a template now always lists
  // explicitly which pickers it should appear in.
  categories: NoteCategory[];
  sort_order: number;
  created_at: string;
  video_url: string; // 0106 — carried along when this template is loaded into a note block
}

export async function listNoteTemplates(): Promise<NoteTemplate[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("session_note_templates")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function saveNoteTemplate(
  template: Omit<NoteTemplate, "id" | "organisation_id" | "created_at">
): Promise<NoteTemplate> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: coach } = await supabase
    .from("coaches").select("organisation_id").eq("id", user.id).single();
  if (!coach) throw new Error("Coach not found");

  const { data, error } = await supabase
    .from("session_note_templates")
    .insert({ ...template, organisation_id: coach.organisation_id })
    .select().single();
  if (error) throw error;
  return data;
}

export async function updateNoteTemplate(
  id: string,
  patch: Partial<Pick<NoteTemplate, "name" | "content" | "categories" | "sort_order" | "video_url">>
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("session_note_templates").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteNoteTemplate(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("session_note_templates").delete().eq("id", id);
  if (error) throw error;
}

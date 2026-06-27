import { createClient } from "@/lib/supabase-browser";
import { getMyOrganisationId } from "@/lib/data/athletes";
import type { LibraryEntry } from "@/types";

export async function listLibrary(): Promise<LibraryEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("library_entries")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Case-insensitive exact-name lookup, used by CSV import and by the
// exercise picker to link a typed/imported name to its saved preset.
export async function findLibraryEntryByName(name: string): Promise<LibraryEntry | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("library_entries")
    .select("*")
    .ilike("name", name.trim())
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveLibraryEntry(
  entry: Partial<LibraryEntry> & { name: string }
): Promise<LibraryEntry> {
  const supabase = createClient();
  const existing = await findLibraryEntryByName(entry.name);

  if (existing) {
    const { data, error } = await supabase
      .from("library_entries")
      .update({
        video_url: entry.video_url ?? existing.video_url,
        sets: entry.sets ?? existing.sets,
        reps: entry.reps ?? existing.reps,
        time: entry.time ?? existing.time,
        rest: entry.rest ?? existing.rest,
        target_load: entry.target_load ?? existing.target_load,
        tempo: entry.tempo ?? existing.tempo,
        notes: entry.notes ?? existing.notes,
        types: entry.types ?? existing.types ?? [],   // FIX: was missing from update
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const organisation_id = await getMyOrganisationId();

  const { data, error } = await supabase
    .from("library_entries")
    .insert({
      organisation_id,
      name: entry.name,
      types: entry.types ?? [],
      video_url: entry.video_url ?? "",
      sets: entry.sets ?? "",
      reps: entry.reps ?? "",
      time: entry.time ?? "",
      rest: entry.rest ?? "",
      target_load: entry.target_load ?? "",
      tempo: entry.tempo ?? "2-0-2",
      notes: entry.notes ?? "",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLibraryEntry(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("library_entries").delete().eq("id", id);
  if (error) throw error;
}

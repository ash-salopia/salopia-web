import { createClient } from "@/lib/supabase-browser";
import type { Athlete } from "@/types";

// Centralising every Supabase query for a given entity in one file like
// this (rather than scattering .from("athletes") calls across every
// page) means there's exactly one place to look when something needs
// fixing, and one place to update if the schema ever changes shape.

// Looks up the signed-in coach's organisation_id, needed whenever
// inserting a new row into an organisation-scoped table. Athletes,
// library entries, templates, and programmes are all shared across
// every coach in the same organisation (see migration 0001's design
// note), so inserts use organisation_id, not the individual coach's
// user id.
export async function getMyOrganisationId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data, error } = await supabase
    .from("coaches")
    .select("organisation_id")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return data.organisation_id;
}

// Lists active (non-archived) athletes by default — this is what
// every normal page (athlete list, dashboard, session builder, the
// Load Template / assign-to-athlete pickers) should use, so an
// archived athlete naturally drops out of day-to-day use without
// any of their data being touched.
export async function listAthletes(): Promise<Athlete[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("athletes")
    .select("*")
    .eq("archived", false)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listArchivedAthletes(): Promise<Athlete[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("athletes")
    .select("*")
    .eq("archived", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function archiveAthlete(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("athletes").update({ archived: true }).eq("id", id);
  if (error) throw error;
}

export async function unarchiveAthlete(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("athletes").update({ archived: false }).eq("id", id);
  if (error) throw error;
}

export async function createAthlete(name: string, group: string, bodyweightKg: number | null = null): Promise<Athlete> {
  const supabase = createClient();
  const organisation_id = await getMyOrganisationId();

  const { data, error } = await supabase
    .from("athletes")
    .insert({ name, group, organisation_id, bodyweight_kg: bodyweightKg ?? null })
    .select()
    .single();
  if (error) {
    // Raised by the check_seat_limit() trigger (0030_seat_licensing.sql)
    // when the organisation's plan has no free seats left.
    if (error.message.includes("SEAT_LIMIT_EXCEEDED")) {
      throw new Error("You've reached the athlete limit for your current plan. Archive an athlete to free up a seat, or contact support to upgrade.");
    }
    throw error;
  }
  return data;
}

export async function updateAthlete(
  id: string,
  patch: Partial<Pick<Athlete, "name" | "group" | "bodyweight_kg">>
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("athletes").update(patch).eq("id", id);
  if (error) throw error;
}

export async function updateAthleteTestingSchedule(
  id: string,
  lastTestDate: string | null,
  retestWeeks: number | null
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("athletes")
    .update({ last_test_date: lastTestDate || null, retest_weeks: retestWeeks || null })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteAthlete(id: string): Promise<void> {
  const supabase = createClient();
  // Sessions reference athletes with ON DELETE CASCADE, so this also
  // removes all of that athlete's sessions and exercises automatically.
  const { error } = await supabase.from("athletes").delete().eq("id", id);
  if (error) throw error;
}

export async function toggleLiveGroup(id: string, inLiveGroup: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("athletes").update({ in_live_group: inLiveGroup }).eq("id", id);
  if (error) throw error;
}

export async function listLiveGroupAthletes(): Promise<Athlete[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("athletes")
    .select("*")
    .eq("in_live_group", true)
    .eq("archived", false)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Regenerates an athlete's share token, invalidating their old link.
// Useful if a link was shared somewhere it shouldn't have been.
export async function regenerateShareLink(id: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("athletes")
    .update({ share_token: crypto.randomUUID() })
    .eq("id", id)
    .select("share_token")
    .single();
  if (error) throw error;
  return data.share_token;
}

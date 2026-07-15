import { createClient } from "@/lib/supabase-browser";
import { getMyOrganisationId } from "@/lib/data/athletes";

// Coach-side management of Session Library access grants — which
// templates a given athlete can browse/log informally via their
// athlete-link "Library" tab, separate from their assigned programme.
// See supabase/migrations/0034_session_library.sql for the schema.
// Athlete-side reads/writes for this feature live in
// lib/data/athlete-share-link.ts instead, following the token-verified
// pattern — this file is browser-client + RLS, coach-only.

export async function listGrantedTemplateIds(athleteId: string): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("athlete_template_access")
    .select("template_id")
    .eq("athlete_id", athleteId);
  if (error) throw error;
  return (data ?? []).map((row) => row.template_id);
}

export async function grantTemplateAccess(athleteId: string, templateId: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const organisation_id = await getMyOrganisationId();

  const { error } = await supabase
    .from("athlete_template_access")
    .upsert(
      { athlete_id: athleteId, template_id: templateId, organisation_id, granted_by: user.id },
      { onConflict: "athlete_id,template_id", ignoreDuplicates: true }
    );
  if (error) throw error;
}

export async function revokeTemplateAccess(athleteId: string, templateId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("athlete_template_access")
    .delete()
    .eq("athlete_id", athleteId)
    .eq("template_id", templateId);
  if (error) throw error;
}

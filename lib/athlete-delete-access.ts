import { createClient } from "@/lib/supabase-server";
import { createServiceRoleClient } from "@/lib/supabase-service";

// Server-only. Who the calling coach is, and whether they're allowed to
// delete athletes at all (owner always; other coaches only when the owner
// has switched on settings.coaches_can_delete_athletes - 0114).
export async function getAthleteDeleteAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: coach } = await supabase
    .from("coaches")
    .select("id, organisation_id, role")
    .eq("id", user.id)
    .single();
  if (!coach) return null;

  const service = createServiceRoleClient();
  const [{ data: org }, { data: secret }] = await Promise.all([
    service.from("organisations").select("settings").eq("id", coach.organisation_id).single(),
    service
      .from("org_secrets")
      .select("athlete_delete_password_hash")
      .eq("organisation_id", coach.organisation_id)
      .maybeSingle(),
  ]);

  const isOwner = coach.role === "owner";
  const coachesAllowed = org?.settings?.coaches_can_delete_athletes === true;

  return {
    supabase,
    service,
    coach,
    isOwner,
    canDelete: isOwner || coachesAllowed,
    passwordHash: (secret?.athlete_delete_password_hash as string | null) ?? null,
  };
}

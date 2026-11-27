// Server-side (service role) access to athletes' contact emails, which
// live in athlete_contacts from 0134 (coaches reach them only through
// athlete_contact()). Until 0134 has been run, falls back to the old
// athletes.contact_email column (0122).

type Service = { from: (t: string) => any };

const missingTable = (e: { code?: string } | null | undefined) => e?.code === "42P01" || e?.code === "PGRST205";

export async function getContactEmail(service: Service, athleteId: string): Promise<string | null> {
  const { data, error } = await service.from("athlete_contacts").select("contact_email").eq("athlete_id", athleteId).maybeSingle();
  if (missingTable(error)) {
    const { data: a } = await service.from("athletes").select("contact_email").eq("id", athleteId).maybeSingle();
    return a?.contact_email || null;
  }
  return data?.contact_email || null;
}

/** First non-archived athlete in the org whose contact email matches. */
export async function findAthleteIdByEmail(service: Service, organisationId: string, email: string): Promise<string | null> {
  const e = email.trim().toLowerCase();
  if (!e) return null;
  const { data: rows, error } = await service
    .from("athlete_contacts")
    .select("athlete_id")
    .eq("organisation_id", organisationId)
    .ilike("contact_email", e);
  let ids: string[] = (rows ?? []).map((r: { athlete_id: string }) => r.athlete_id);
  if (missingTable(error)) {
    const { data: old } = await service
      .from("athletes")
      .select("id")
      .eq("organisation_id", organisationId)
      .ilike("contact_email", e)
      .eq("archived", false)
      .limit(1);
    return old?.[0]?.id ?? null;
  }
  if (!ids.length) return null;
  const { data: live } = await service.from("athletes").select("id").in("id", ids).eq("archived", false).limit(1);
  ids = (live ?? []).map((r: { id: string }) => r.id);
  return ids[0] ?? null;
}

export async function saveContactEmail(service: Service, athleteId: string, organisationId: string, email: string | null): Promise<void> {
  const { error } = await service
    .from("athlete_contacts")
    .upsert({ athlete_id: athleteId, organisation_id: organisationId, contact_email: email, updated_at: new Date().toISOString() });
  if (missingTable(error)) {
    await service.from("athletes").update({ contact_email: email }).eq("id", athleteId);
  } else if (error) {
    console.error("[athlete-contacts] save failed", error);
  }
}

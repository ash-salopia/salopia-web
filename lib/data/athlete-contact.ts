import { createClient } from "@/lib/supabase-browser";

// An athlete's contact email (0134). It lives in athlete_contacts, which
// coaches can only reach through the athlete_contact() /
// set_athlete_contact() functions - they hide it from coaches when the
// owner has switched "Coaches can see contact details" off.
//
// Until 0134 has been run the functions don't exist, so both fall back
// to the old athletes.contact_email column (0122).

export interface AthleteContact {
  visible: boolean; // false = this coach isn't allowed to see it
  email: string | null; // null when hidden or not set
  hasEmail: boolean; // one is saved (even if hidden)
}

const missingFn = (e: { code?: string } | null) => e?.code === "PGRST202" || e?.code === "42883";

export async function getAthleteContact(athleteId: string): Promise<AthleteContact> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("athlete_contact", { p_athlete_id: athleteId });
  if (!error && data) {
    const d = data as { visible?: boolean; email?: string | null; has_email?: boolean };
    return { visible: d.visible !== false, email: d.email ?? null, hasEmail: d.has_email === true };
  }
  if (missingFn(error)) {
    const { data: a } = await supabase.from("athletes").select("contact_email").eq("id", athleteId).maybeSingle();
    const email = ((a as { contact_email?: string | null } | null)?.contact_email ?? null) || null;
    return { visible: true, email, hasEmail: !!email };
  }
  return { visible: false, email: null, hasEmail: false };
}

export async function setAthleteContact(athleteId: string, email: string | null): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_athlete_contact", { p_athlete_id: athleteId, p_email: email ?? "" });
  if (!error) return;
  if (missingFn(error)) {
    const { error: upErr } = await supabase.from("athletes").update({ contact_email: email }).eq("id", athleteId);
    if (upErr) throw upErr;
    return;
  }
  throw error;
}

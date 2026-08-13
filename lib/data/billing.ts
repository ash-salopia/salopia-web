import { createClient } from "@/lib/supabase-browser";
import { getMyOrganisationId } from "@/lib/data/athletes";

export interface OrganisationBilling {
  plan: string;
  seat_limit: number | null;
  subscription_status: string | null;
  past_due_since: string | null;
  billing_interval: string | null;
}

export async function getOrganisationBilling(): Promise<OrganisationBilling> {
  const supabase = createClient();
  const organisation_id = await getMyOrganisationId();

  const { data, error } = await supabase
    .from("organisations")
    .select("plan, seat_limit, subscription_status, past_due_since, billing_interval")
    .eq("id", organisation_id)
    .single();
  if (error) throw error;
  return data;
}

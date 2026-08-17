import "server-only";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { isReadOnlyRestricted } from "@/lib/billing/access";
import type { Template, TemplateDef } from "@/types";

// Public, no-login lookup for a Home Programme (0058) — resolves a
// /g/<code> share code the exact same way getAthleteByShareToken
// resolves an athlete token: service-role (no session/RLS to check
// against), and every failure path — code doesn't exist, expired, or
// the coach's org is billing-restricted — collapses to the same null,
// never revealing which, since that distinction could help someone
// probe for valid codes.
export async function getPublishedTemplateByCode(code: string): Promise<Template | null> {
  const supabase = createServiceRoleClient();
  try {
    const { data: template, error } = await supabase
      .from("templates")
      .select("*, template_defs(*)")
      .eq("share_code", code)
      .maybeSingle();
    if (error || !template) return null;

    if (template.share_expires_at && new Date(template.share_expires_at).getTime() < Date.now()) {
      return null;
    }

    const { data: org } = await supabase
      .from("organisations")
      .select("subscription_status, past_due_since")
      .eq("id", template.organisation_id)
      .single();
    if (org && isReadOnlyRestricted(org)) return null;

    return {
      ...template,
      defs: (template.template_defs ?? []).sort((a: TemplateDef, b: TemplateDef) => a.sort_order - b.sort_order),
    };
  } catch {
    return null;
  }
}

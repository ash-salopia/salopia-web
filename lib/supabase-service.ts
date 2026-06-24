import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// CRITICAL: this file must never be imported from a "use client"
// component, and SUPABASE_SERVICE_ROLE_KEY must never carry a
// NEXT_PUBLIC_ prefix. The `server-only` import above makes Next.js
// throw a build error if this ever gets pulled into client code by
// accident, as a hard guardrail on top of the naming convention.
//
// This client bypasses Row Level Security completely — every query
// made with it can read or write ANY row in ANY table, regardless of
// organisation. It exists for exactly one purpose: the athlete
// share-link view (app/a/[token]/), where an anonymous visitor has no
// Supabase Auth session and therefore no auth.uid() for RLS to check
// against. The route itself is responsible for manually scoping every
// query to the one athlete matching the share token — this client
// provides no scoping on its own.
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase service role configuration. Check SUPABASE_SERVICE_ROLE_KEY in .env.local."
    );
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

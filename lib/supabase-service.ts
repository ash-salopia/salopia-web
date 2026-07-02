import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// CRITICAL: never import from a "use client" component.
// SUPABASE_SERVICE_ROLE_KEY must never have a NEXT_PUBLIC_ prefix.
// This client bypasses RLS completely — every query can read/write
// any row. Exists solely for athlete share-link routes where there
// is no auth session for RLS to check against.
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

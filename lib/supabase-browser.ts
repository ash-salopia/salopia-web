import { createBrowserClient } from "@supabase/ssr";

// Used inside client components ("use client"). Reads the public,
// safe-to-expose env vars — never put the service role key here.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

// Self-contained root page — does its own direct check rather than
// relying on a separate redirect hop through another route (an
// earlier version re-exported app/(coach)/page.tsx here, which Next.js's
// build process didn't handle cleanly across two different routes
// resolving to the same URL, and a version before that had no auth
// check here at all, which combined with middleware's separate check
// caused a rapid-redirect loop right after sign-in). One direct check,
// here, is simpler and avoids both problems.
export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/athletes" : "/login");
}

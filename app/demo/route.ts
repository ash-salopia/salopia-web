import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// A public, credential-less entry point for demoing the app to a
// prospective coach — signs the visitor straight into a fixed,
// pre-populated demo organisation (see scripts/seed-demo-org.js) and
// drops them on the dashboard. Nothing to remember or type: just
// share this URL. The demo coach's credentials never reach the
// client — they're read from env vars and used in a single
// server-side signInWithPassword call.
export async function GET(request: Request) {
  const email = process.env.DEMO_COACH_EMAIL;
  const password = process.env.DEMO_COACH_PASSWORD;
  const { origin } = new URL(request.url);

  if (!email || !password) {
    return NextResponse.redirect(`${origin}/login?error=demo_unavailable`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error("Demo login failed:", error.message);
    return NextResponse.redirect(`${origin}/login?error=demo_unavailable`);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}

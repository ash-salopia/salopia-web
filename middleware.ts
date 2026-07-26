import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Runs on every request. Two jobs:
// 1. Refresh the Supabase auth session so it doesn't silently expire.
// 2. Redirect to /login if someone tries to load a coach page while
//    signed out, and redirect away from /login if already signed in.
//
// RULES OF THUMB when adding new routes:
// - Any athlete-facing API belongs under /api/athlete-link/ — that whole
//   prefix bypasses auth automatically (token validation happens inside
//   each route handler). No middleware change needed.
// - API routes NEVER get redirected to /login. Redirecting an API call
//   returns HTML to a fetch() that expected JSON, which surfaces as
//   confusing parse errors client-side. They get a 401 JSON response.
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // These never look at `user` at all (auth callback, the athlete
  // share-link app, and its token-validated APIs) — skip the auth
  // check entirely rather than paying a real network round-trip to
  // Supabase's auth server for a value that's never used. `/login`
  // is excluded here even though it's also unauthenticated-accessible,
  // because it still needs `user` below to redirect an already-signed-in
  // visitor away.
  const skipsAuthCheck =
    path.startsWith("/auth") ||
    path.startsWith("/a/") ||               // athlete share-link pages
    path.startsWith("/api/athlete-link/");  // athlete APIs — token-validated in each handler

  if (skipsAuthCheck) {
    return NextResponse.next({ request });
  }

  const isPublicPath = path.startsWith("/login");

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getSession() decodes the JWT from cookies locally — no network
  // call — unlike getUser(), which re-validates against Supabase's
  // auth server on every request (~40-160ms measured against this
  // project, paid on every coach page load and API call since a
  // logged-in coach always carries a session cookie). This is only
  // deciding whether to show the dashboard shell or redirect to
  // /login; actual data access is separately protected by RLS
  // (my_organisation_id() / auth.uid()), which re-validates the JWT
  // itself on every query regardless of what this check decides. Only
  // consequence of the swap: a revoked session can pass this redirect
  // gate until its JWT naturally expires (~1hr) instead of being
  // caught immediately — it still can't read/write anything via RLS.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  if (!user && !isPublicPath) {
    // API routes get a JSON 401, never an HTML redirect
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isPublicPath && !request.nextUrl.searchParams.has("error")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on everything except static assets and Next.js internals
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

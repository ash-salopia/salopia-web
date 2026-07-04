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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Public paths — no auth required
  const isPublicPath =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/a/") ||               // athlete share-link pages
    path.startsWith("/api/athlete-link/");  // athlete APIs — token-validated in each handler

  if (!user && !isPublicPath) {
    // API routes get a JSON 401, never an HTML redirect
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && path.startsWith("/login") && !request.nextUrl.searchParams.has("error")) {
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

import { NextRequest, NextResponse } from "next/server";

// Minimal error-visibility stopgap — not a replacement for real error
// monitoring (Sentry etc.), just enough that a crash a beta coach hits
// shows up SOMEWHERE Ash can see it, rather than only in that coach's
// own browser console. app/error.tsx POSTs here when its boundary
// catches a render error; console.error output lands in Vercel's
// Runtime Logs (Project → Logs in the dashboard) — no new service or
// account needed to read it.
//
// Deliberately unauthenticated (an error boundary can fire before any
// session context is available) and fire-and-forget from the client —
// never let a logging failure compound the original error.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, digest, stack, url, name } = body ?? {};
    console.error(
      "[client-error]",
      JSON.stringify({
        name: typeof name === "string" ? name.slice(0, 200) : undefined,
        message: typeof message === "string" ? message.slice(0, 2000) : undefined,
        digest: typeof digest === "string" ? digest : undefined,
        url: typeof url === "string" ? url.slice(0, 500) : undefined,
        stack: typeof stack === "string" ? stack.slice(0, 4000) : undefined,
      })
    );
  } catch {
    // Malformed payload — nothing to log, nothing to fail on.
  }
  return NextResponse.json({ ok: true });
}

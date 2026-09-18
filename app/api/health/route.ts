import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Deliberately does not contact Supabase or another processor. AWS uses this
// route only to decide whether the web process can receive traffic.
export async function GET() {
  return NextResponse.json(
    { ok: true, service: "vis-build-app" },
    { headers: { "Cache-Control": "no-store" } }
  );
}

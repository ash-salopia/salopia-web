import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceRoleClient } from "@/lib/supabase-service";

// Gate for every paid AI route on the coach side. Two jobs:
//  1. A real login check. middleware.ts only decodes the session cookie
//     locally (getSession, no signature check), which is fine for pages
//     whose data RLS protects - but these routes spend money without
//     touching the database, so they verify with getUser() themselves.
//  2. A daily cap per coach per feature, counted from ai_usage (0119).
//     The public demo login is one shared coach, so its cap is shared by
//     every demo visitor - kept low on purpose.

export type AIFeature =
  | "notes-parse"
  | "voice-transcribe"
  | "voice-parse"
  | "session-modify"
  | "programme-assign-parse"
  | "training-report-ai";

// Generous for real coaching use; a coach building a block from notes
// might take a few goes per session, not hundreds.
const DAILY_LIMIT: Record<AIFeature, number> = {
  "notes-parse": 60,
  "voice-transcribe": 100,
  "voice-parse": 100,
  "session-modify": 40,
  "programme-assign-parse": 40,
  "training-report-ai": 60,
};
const DEMO_DAILY_LIMIT = 15;

export type AIGuardResult =
  | { ok: true; coachId: string; organisationId: string }
  | { ok: false; response: NextResponse<{ error: string }> };

// Request size caps, checked from Content-Length before any work (and
// before the body is read). Audio uploads are big; everything else is
// text, where 1MB is already far more than any real session or notes.
// notes-parse can carry a PDF as base64, up to Vercel's own ~4.5MB cap.
const MAX_BYTES: Partial<Record<AIFeature, number>> = {
  "voice-transcribe": 25 * 1024 * 1024,
  "notes-parse": 5 * 1024 * 1024,
};
const DEFAULT_MAX_BYTES = 1024 * 1024;

export async function guardAIRequest(feature: AIFeature, req?: Request): Promise<AIGuardResult> {
  const size = Number(req?.headers.get("content-length") ?? 0);
  if (size > (MAX_BYTES[feature] ?? DEFAULT_MAX_BYTES)) {
    return { ok: false, response: NextResponse.json({ error: "That's too much to process in one go - try a smaller amount" }, { status: 413 }) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  }
  const { data: coach } = await supabase
    .from("coaches")
    .select("id, organisation_id, email")
    .eq("id", user.id)
    .single();
  if (!coach) {
    return { ok: false, response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  }

  const isDemo =
    !!process.env.DEMO_COACH_EMAIL &&
    (coach.email ?? user.email ?? "").toLowerCase() === process.env.DEMO_COACH_EMAIL.toLowerCase();
  const limit = isDemo ? DEMO_DAILY_LIMIT : DAILY_LIMIT[feature];

  const service = createServiceRoleClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await service
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("coach_id", coach.id)
    .eq("feature", feature)
    .gte("created_at", since);
  // Table missing (0119 not run yet) or a blip: don't block real coaches
  // over the counter itself - the login check above still applies.
  if (countError) console.error("[ai-usage] count failed", countError.message);
  else if ((count ?? 0) >= limit) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: isDemo
            ? "The demo has reached today's limit for AI features. Sign up free to keep using them."
            : "You've reached today's limit for this AI feature. It resets over the next 24 hours - contact support if you need more.",
        },
        { status: 429 }
      ),
    };
  }

  const { error: logError } = await service
    .from("ai_usage")
    .insert({ coach_id: coach.id, organisation_id: coach.organisation_id, feature });
  if (logError) console.error("[ai-usage] log failed", logError.message);

  return { ok: true, coachId: coach.id, organisationId: coach.organisation_id };
}

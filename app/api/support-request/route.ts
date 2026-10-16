import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceRoleClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

// "Email support" from the help assistant. Always saved to
// support_requests (0116) first, so nothing is lost; then emailed to
// support via Resend if RESEND_API_KEY is set (silently skipped if not -
// same "no-ops without its key" pattern as the other optional services).
// Reply-to is the coach, so answering the email reaches them directly.

const DAILY_LIMIT = 5;
const MAX_MESSAGE = 4000;
const MAX_TRANSCRIPT = 8000;

async function sendEmail(opts: { replyTo: string; subject: string; text: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const from = process.env.SUPPORT_EMAIL_FROM || "VIS BUILD Support <support@visbuild.co.uk>";
  const to = process.env.SUPPORT_EMAIL_TO || "support@visbuild.co.uk";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], reply_to: opts.replyTo, subject: opts.subject, text: opts.text }),
    });
    if (!res.ok) {
      console.error("[support-request] Resend failed", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[support-request] Resend unreachable", e);
    return false;
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: coach } = await supabase
    .from("coaches")
    .select("id, name, organisation_id")
    .eq("id", user.id)
    .single();
  if (!coach) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim().slice(0, MAX_MESSAGE) : "";
  const transcript = typeof body.transcript === "string" ? body.transcript.slice(0, MAX_TRANSCRIPT) : "";
  const page = typeof body.page === "string" ? body.page.slice(0, 200) : null;
  if (!message) return NextResponse.json({ error: "Tell us what you need help with." }, { status: 400 });

  const service = createServiceRoleClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await service
    .from("support_requests")
    .select("id", { count: "exact", head: true })
    .eq("coach_id", coach.id)
    .gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) {
    return NextResponse.json(
      { error: "You've sent a few requests today already - we'll reply to those as soon as we can." },
      { status: 429 }
    );
  }

  const { data: org } = await service.from("organisations").select("name").eq("id", coach.organisation_id).maybeSingle();
  const orgName: string = org?.name ?? "";
  const { data: saved, error } = await service
    .from("support_requests")
    .insert({
      organisation_id: coach.organisation_id,
      coach_id: coach.id,
      coach_email: user.email ?? null,
      coach_name: coach.name ?? null,
      message,
      transcript: transcript || null,
      page,
    })
    .select("id")
    .single();
  if (error || !saved) {
    console.error("[support-request] save failed", error);
    return NextResponse.json(
      { error: "Couldn't send that. Please email support@visbuild.co.uk directly." },
      { status: 500 }
    );
  }

  const emailed = user.email
    ? await sendEmail({
        replyTo: user.email,
        subject: `Support request: ${coach.name || user.email}${orgName ? ` (${orgName})` : ""}`,
        text: [
          `From: ${coach.name || "-"} <${user.email}>`,
          `Organisation: ${orgName || "-"}`,
          `Page: ${page || "-"}`,
          "",
          message,
          ...(transcript ? ["", "--- Help assistant conversation ---", transcript] : []),
          "",
          `(Request ${saved.id} - also saved in the support_requests table.)`,
        ].join("\n"),
      })
    : false;
  if (emailed) await service.from("support_requests").update({ emailed: true }).eq("id", saved.id);

  return NextResponse.json({ ok: true });
}

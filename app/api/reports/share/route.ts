import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/email";
import { sendPushToAthlete } from "@/lib/push/send";

export const dynamic = "force-dynamic";

// "Email report to client" (0122). Saves a snapshot of the generated
// Training Report (the same print-ready HTML the Print button builds)
// as a shared_reports row, viewable without a login at /r/<id>, then -
// if recipients are given and Resend is configured - emails them a
// short summary with a "View full report" button. The email carries a
// link rather than the report itself because email apps strip the SVG
// charts. Without RESEND_API_KEY the link is still created and returned,
// so the coach can copy it or send it from their own email app.

const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_RECIPIENTS = 5;
const DAILY_SHARES_PER_ORG = 100;
const DAILY_EMAILS_PER_ORG = 50;
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The public page also sends a CSP that blocks all scripts, so this is
// belt and braces: drop script tags, inline event handlers and
// javascript: URLs from the coach-supplied HTML.
function sanitise(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<(iframe|object|embed|form)\b[\s\S]*?(<\/\1\s*>|\/?>)/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "$1=$2#$2");
}

interface Summary {
  sessionsCompleted?: number;
  sessionsAssigned?: number;
  completionPct?: number | null;
  pbCount?: number;
  avgRpe?: number | null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function emailHtml(opts: {
  brand: string;
  coachName: string;
  athleteName: string;
  rangeLabel: string;
  message: string;
  url: string;
  expires: string;
  summary: Summary | null;
}): string {
  const s = opts.summary;
  const stats: [string, string][] = [];
  if (s) {
    const done = num(s.sessionsCompleted);
    const assigned = num(s.sessionsAssigned);
    if (done != null) stats.push(["Sessions done", assigned ? `${done} <span style="color:#6b7684;font-size:13px;">of ${assigned}</span>` : String(done)]);
    const comp = num(s.completionPct);
    if (comp != null) stats.push(["Completion", `${Math.round(comp)}%`]);
    const pbs = num(s.pbCount);
    if (pbs != null) stats.push(["PBs", String(pbs)]);
    const rpe = num(s.avgRpe);
    if (rpe != null) stats.push(["Avg RPE", `${rpe}`]);
  }
  const statCells = stats
    .map(
      ([label, value]) => `<td style="padding:12px 10px;border:1px solid #e3e7ec;border-radius:10px;background:#f7f8fa;" valign="top">
          <div style="font-size:11px;font-weight:700;color:#6b7684;text-transform:uppercase;letter-spacing:.05em;">${esc(label)}</div>
          <div style="font-size:24px;font-weight:700;color:#16202a;margin-top:4px;">${value}</div>
        </td>`
    )
    .join('<td style="width:8px;"></td>');
  const message = esc(opts.message).replace(/\n/g, "<br>");
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#eef0f3;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f3;padding:24px 12px;"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;padding:28px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#16202a;">
      <tr><td>
        <div style="font-size:13px;font-weight:800;letter-spacing:.12em;color:#1f6fd6;text-transform:uppercase;">${esc(opts.brand)}</div>
        <h1 style="font-size:22px;margin:10px 0 2px;">${esc(opts.athleteName)} &middot; Training Report</h1>
        <div style="font-size:13px;color:#6b7684;">${esc(opts.rangeLabel)}</div>
        ${message ? `<p style="font-size:15px;line-height:1.55;margin:20px 0 0;">${message}</p>` : ""}
        ${stats.length ? `<table cellpadding="0" cellspacing="0" style="margin-top:22px;width:100%;border-collapse:separate;"><tr>${statCells}</tr></table>` : ""}
        <div style="margin-top:26px;">
          <a href="${esc(opts.url)}" style="display:inline-block;background:#1f6fd6;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:10px;">View full report</a>
        </div>
        <p style="font-size:13px;color:#6b7684;line-height:1.5;margin:22px 0 0;">
          The full report has progress charts, personal bests and a consistency calendar, and can be printed or saved as a PDF from your browser. The link works until ${esc(opts.expires)}.
        </p>
        <p style="font-size:13px;color:#6b7684;line-height:1.5;margin:14px 0 0;">Sent by ${esc(opts.coachName)}. Reply to this email to reach them directly.</p>
      </td></tr>
    </table>
    <div style="font-size:11px;color:#8a94a1;margin-top:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Produced using visbuild.co.uk</div>
  </td></tr></table>
</body></html>`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const athleteId = typeof body.athleteId === "string" ? body.athleteId : "";
  const html = typeof body.html === "string" ? body.html : "";
  const title = typeof body.title === "string" ? body.title.slice(0, 200) : "";
  const rangeLabel = typeof body.rangeLabel === "string" ? body.rangeLabel.slice(0, 100) : "";
  const message = typeof body.message === "string" ? body.message.slice(0, 2000) : "";
  const recipients: string[] = Array.isArray(body.emailTo)
    ? Array.from(new Set(body.emailTo.map((e: unknown) => String(e).trim().toLowerCase()).filter(Boolean)))
    : [];
  if (!athleteId || !html) return NextResponse.json({ error: "Missing report" }, { status: 400 });
  if (new TextEncoder().encode(html).length > MAX_HTML_BYTES) return NextResponse.json({ error: "Report is too large to share" }, { status: 413 });
  if (recipients.length > MAX_RECIPIENTS) return NextResponse.json({ error: `Up to ${MAX_RECIPIENTS} email addresses at a time` }, { status: 400 });
  const bad = recipients.find((e) => !EMAIL_RE.test(e));
  if (bad) return NextResponse.json({ error: `"${bad}" doesn't look like an email address` }, { status: 400 });

  const { data: coach } = await supabase.from("coaches").select("id, name, email, organisation_id").eq("id", user.id).single();
  if (!coach) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  // RLS: only returns the athlete if this coach can access them.
  const { data: athlete } = await supabase.from("athletes").select("id, name, organisation_id").eq("id", athleteId).maybeSingle();
  if (!athlete) return NextResponse.json({ error: "Athlete not found" }, { status: 404 });

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("shared_reports")
    .select("emailed_to")
    .eq("organisation_id", coach.organisation_id)
    .gte("created_at", since);
  if ((recent?.length ?? 0) >= DAILY_SHARES_PER_ORG) {
    return NextResponse.json({ error: "Daily limit for shared reports reached - try again tomorrow" }, { status: 429 });
  }
  const emailedToday = (recent ?? []).reduce((n, r) => n + ((r.emailed_to as string[] | null)?.length ?? 0), 0);
  if (recipients.length && emailedToday + recipients.length > DAILY_EMAILS_PER_ORG) {
    return NextResponse.json({ error: "Daily email limit reached - copy the link instead, or try again tomorrow" }, { status: 429 });
  }

  const showInApp = body.showInApp !== false;
  const style = body.style === "colour" ? "colour" : "white";
  const base = {
    organisation_id: coach.organisation_id,
    athlete_id: athlete.id,
    created_by: coach.id,
    title: title || `${athlete.name} - Training Report`,
    html: sanitise(html),
  };
  // 0123 columns (history / athlete app); fall back to the 0122 shape if
  // that migration hasn't been run yet.
  let { data: row, error: insErr } = await supabase
    .from("shared_reports")
    .insert({ ...base, visible_to_athlete: showInApp, style, range_label: rangeLabel })
    .select("id, expires_at")
    .single();
  if (insErr?.code === "42703" || insErr?.code === "PGRST204") {
    ({ data: row, error: insErr } = await supabase.from("shared_reports").insert(base).select("id, expires_at").single());
  }
  if (insErr || !row) {
    console.error("[reports/share] insert failed", insErr);
    return NextResponse.json({ error: insErr?.message ?? "Could not save the report" }, { status: 500 });
  }

  const url = `${req.nextUrl.origin}/r/${row.id}`;
  const expires = new Date(row.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  if (body.saveEmail && recipients[0]) {
    const { error } = await supabase.from("athletes").update({ contact_email: recipients[0] }).eq("id", athlete.id);
    if (error) console.error("[reports/share] saving contact email failed", error);
  }

  if (showInApp) {
    const { data: ath } = await supabase.from("athletes").select("share_token").eq("id", athlete.id).maybeSingle();
    if (ath?.share_token) {
      sendPushToAthlete(athlete.id, {
        title: "New training report",
        body: `${String(coach.name || "Your coach")} shared your report${rangeLabel ? ` for ${rangeLabel}` : ""}`,
        url: `/a/${ath.share_token}/reports`,
      }).catch(() => {});
    }
  }

  if (!recipients.length) return NextResponse.json({ url, emailed: false });

  const coachName = String(coach.name || "Your coach").replace(/["<>\r\n]/g, "").slice(0, 60);
  const { data: org } = await supabase.from("organisations").select("name").eq("id", coach.organisation_id).maybeSingle();
  const brand = String(org?.name || "VIS BUILD");
  const subject =
    typeof body.subject === "string" && body.subject.trim()
      ? body.subject.trim()
      : `${athlete.name} - Training Report${rangeLabel ? ` (${rangeLabel})` : ""}`;

  const sent = await sendEmail({
    to: recipients,
    subject,
    fromName: `${coachName} via VIS BUILD`,
    replyTo: coach.email,
    html: emailHtml({ brand, coachName, athleteName: athlete.name, rangeLabel, message, url, expires, summary: body.summary ?? null }),
    text: `${message ? message + "\n\n" : ""}View ${athlete.name}'s full training report: ${url}\n\nThe link works until ${expires}. Reply to this email to reach ${coachName}.`,
  });
  if (!sent.ok) return NextResponse.json({ url, emailed: false, reason: sent.reason });

  await supabase.from("shared_reports").update({ emailed_to: recipients, emailed_at: new Date().toISOString() }).eq("id", row.id);
  return NextResponse.json({ url, emailed: true });
}

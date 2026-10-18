import "server-only";

// Transactional email via Resend (reports, store receipts, reminders).
// Silently unavailable without RESEND_API_KEY - callers get
// { ok: false, reason: "not_configured" } and decide what to show,
// same "no-ops without its key" pattern as push and Sentry.
//
// Sent from our own domain (it has to be, to be delivered). `fromName`
// lets a coach appear as the sender ("Ash via VIS BUILD"); replies go
// to `replyTo`.

export type EmailResult = { ok: true } | { ok: false; reason: "not_configured" | "send_failed" };

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(opts: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  fromName?: string;
}): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, reason: "not_configured" };
  const fromEnv = process.env.REPORT_EMAIL_FROM || process.env.SUPPORT_EMAIL_FROM || "VIS BUILD <support@visbuild.co.uk>";
  const address = fromEnv.match(/<([^>]+)>/)?.[1] ?? fromEnv;
  const name = (opts.fromName ?? "VIS BUILD").replace(/["<>\r\n]/g, "").slice(0, 80);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `"${name}" <${address}>`,
        to: opts.to,
        reply_to: opts.replyTo || undefined,
        subject: opts.subject.replace(/[\r\n]/g, " ").slice(0, 200),
        html: opts.html,
        text: opts.text,
      }),
    });
    if (!res.ok) {
      console.error("[email] Resend failed", res.status, await res.text().catch(() => ""));
      return { ok: false, reason: "send_failed" };
    }
    return { ok: true };
  } catch (e) {
    console.error("[email] Resend unreachable", e);
    return { ok: false, reason: "send_failed" };
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A simple branded email: heading, paragraphs (already-escaped HTML allowed), optional button. */
export function simpleEmailHtml(opts: { brand: string; heading: string; paragraphs: string[]; button?: { label: string; url: string }; footer?: string }): string {
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#eef0f3;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f3;padding:24px 12px;"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;padding:28px 24px;font-family:${font};color:#16202a;">
      <tr><td>
        <div style="font-size:13px;font-weight:800;letter-spacing:.12em;color:#1f6fd6;text-transform:uppercase;">${escapeHtml(opts.brand)}</div>
        <h1 style="font-size:21px;margin:10px 0 0;">${escapeHtml(opts.heading)}</h1>
        ${opts.paragraphs.map((p) => `<p style="font-size:15px;line-height:1.55;margin:16px 0 0;">${p}</p>`).join("")}
        ${opts.button ? `<div style="margin-top:24px;"><a href="${escapeHtml(opts.button.url)}" style="display:inline-block;background:#1f6fd6;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:10px;">${escapeHtml(opts.button.label)}</a></div>` : ""}
        ${opts.footer ? `<p style="font-size:13px;color:#6b7684;line-height:1.5;margin:22px 0 0;">${opts.footer}</p>` : ""}
      </td></tr>
    </table>
    <div style="font-size:11px;color:#8a94a1;margin-top:14px;font-family:${font};">Produced using visbuild.co.uk</div>
  </td></tr></table>
</body></html>`;
}

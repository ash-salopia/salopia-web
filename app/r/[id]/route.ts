import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

// Public view of an emailed/shared Training Report (0122). No login:
// the random uuid in the URL is the key, like athlete share links.
// The stored HTML was built in the coach's browser, so it's served
// with a CSP that allows no scripts at all (and `sandbox`), which
// means even a tampered snapshot can't run code on this domain.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HEADERS: Record<string, string> = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy":
    "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox allow-popups allow-modals",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "private, no-store",
};

function message(title: string, body: string, status: number): Response {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#16202a;padding:24px;text-align:center;">
<div><h1 style="font-size:22px;margin:0 0 8px;">${title}</h1><p style="color:#6b7684;margin:0;">${body}</p></div></body></html>`;
  return new Response(html, { status, headers: HEADERS });
}

// Top-of-page hint for whoever opens the link; hidden when printing.
const BAR = `<div class="vb-share-bar" style="background:#eef3fb;border:1px solid #cfdcf1;color:#1f3b63;border-radius:10px;padding:10px 14px;font-size:13px;margin-bottom:20px;">
To keep a copy, use your browser&rsquo;s <b>Print</b> option and choose <b>Save as PDF</b>.</div>
<style>@media print { .vb-share-bar { display: none !important; } }</style>`;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) return message("Report not found", "Check the link and try again.", 404);

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.from("shared_reports").select("html, expires_at").eq("id", params.id).maybeSingle();
  if (error || !data) return message("Report not found", "Check the link and try again.", 404);
  if (new Date(data.expires_at).getTime() < Date.now()) {
    return message("This report link has expired", "Ask your coach to send a new one.", 410);
  }

  const html = String(data.html).replace(/<body([^>]*)>/i, `<body$1>${BAR}`);
  return new Response(html, { status: 200, headers: HEADERS });
}

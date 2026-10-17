"use client";

import { useState } from "react";
import type { Headline } from "@/lib/report-visuals";

// "Email report to client" (0122), opened from the Training Report.
// Posts the print-ready report HTML to /api/reports/share, which saves it
// as a /r/<id> link and emails the recipients a summary + "View full
// report" button. If email isn't set up on the server (no Resend key),
// or sending fails, the link is still created - the coach can copy it
// or open it in their own email app instead.

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

type Result =
  | { kind: "sent"; url: string; to: string[] }
  | { kind: "link"; url: string; reason?: string; to: string[] };

export default function EmailReportDialog({
  athleteId,
  athleteName,
  savedEmail,
  rangeLabel,
  summary,
  buildHtml,
  onSavedEmail,
  onShared,
  onClose,
}: {
  athleteId: string;
  athleteName: string;
  savedEmail: string | null;
  rangeLabel: string;
  summary: Headline | null;
  buildHtml: (style: "white" | "colour") => string | null;
  onSavedEmail?: (email: string) => void;
  onShared?: () => void;
  onClose: () => void;
}) {
  const firstName = athleteName.split(" ")[0] || athleteName;
  const [to, setTo] = useState(savedEmail ?? "");
  const [saveEmail, setSaveEmail] = useState(!savedEmail);
  const [message, setMessage] = useState(`Hi,\n\nHere's ${firstName}'s training report for ${rangeLabel}.`);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const [style, setStyle] = useState<"colour" | "white">("colour");
  const [showInApp, setShowInApp] = useState(true);

  const recipients = to
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  const invalid = recipients.find((e) => !EMAIL_RE.test(e));
  const firstRecipient = recipients[0]?.toLowerCase() ?? "";
  const differsFromSaved = !!firstRecipient && firstRecipient !== (savedEmail ?? "").toLowerCase();

  const share = async (withEmail: boolean) => {
    setError("");
    if (withEmail && !recipients.length) return setError("Add an email address.");
    if (withEmail && invalid) return setError(`"${invalid}" doesn't look like an email address.`);
    const html = buildHtml(style);
    if (!html) return setError("Couldn't read the report - close it and generate it again.");
    setSending(true);
    try {
      const res = await fetch("/api/reports/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          athleteId,
          html,
          title: `${athleteName} - Training Report (${rangeLabel})`,
          rangeLabel,
          style,
          showInApp,
          message: withEmail ? message : "",
          emailTo: withEmail ? recipients : [],
          saveEmail: withEmail && saveEmail && differsFromSaved,
          summary: summary
            ? {
                sessionsCompleted: summary.sessionsCompleted,
                sessionsAssigned: summary.sessionsAssigned,
                completionPct: summary.completionPct,
                pbCount: summary.pbCount,
                avgRpe: summary.avgRpe,
              }
            : null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) throw new Error(json.error || "Couldn't share the report.");
      if (withEmail && saveEmail && differsFromSaved) onSavedEmail?.(firstRecipient);
      onShared?.();
      setResult(json.emailed ? { kind: "sent", url: json.url, to: recipients } : { kind: "link", url: json.url, reason: json.reason, to: withEmail ? recipients : [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't share the report.");
    } finally {
      setSending(false);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked - the link is visible to copy by hand */
    }
  };

  const mailto = (url: string, toList: string[]) =>
    `mailto:${encodeURIComponent(toList.join(","))}?subject=${encodeURIComponent(`${athleteName} - Training Report (${rangeLabel})`)}&body=${encodeURIComponent(`${message}\n\nView the full report: ${url}`)}`;

  return (
    <div style={d.overlay} onClick={onClose}>
      <div style={d.panel} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={d.head}>
          <div style={d.title}>Email report</div>
          <button style={d.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {result ? (
          <div>
            {result.kind === "sent" ? (
              <div style={d.success}>✓ Sent to {result.to.join(", ")}</div>
            ) : result.reason === "not_configured" || result.reason === "send_failed" ? (
              <div style={d.warn}>
                {result.reason === "not_configured"
                  ? "Email sending isn't switched on for VIS BUILD yet, so nothing was sent."
                  : "The email couldn't be sent just now."}{" "}
                The report link is ready - send it from your own email instead.
              </div>
            ) : (
              <div style={d.success}>✓ Link created</div>
            )}
            <div style={d.label}>Report link (works for 90 days)</div>
            <div style={d.linkRow}>
              <input readOnly value={result.url} style={{ ...d.input, flex: 1 }} onFocus={(e) => e.currentTarget.select()} />
              <button style={d.ghostBtn} onClick={() => copy(result.url)}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              {result.kind === "link" && (
                <a style={{ ...d.primaryBtn, textDecoration: "none" }} href={mailto(result.url, result.to)}>
                  Open in my email app
                </a>
              )}
              <a style={{ ...d.ghostBtn, textDecoration: "none" }} href={result.url} target="_blank" rel="noreferrer">
                Preview ↗
              </a>
              <button style={d.ghostBtn} onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={d.label}>To</div>
            <input
              type="email"
              multiple
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="athlete@example.com, parent@example.com"
              style={d.input}
              autoFocus={!savedEmail}
            />
            {differsFromSaved && (
              <label style={d.check}>
                <input type="checkbox" checked={saveEmail} onChange={(e) => setSaveEmail(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                Save {firstRecipient} as {firstName}&apos;s email for next time
              </label>
            )}

            <div style={d.label}>Report style</div>
            <div style={{ display: "flex", gap: 8 }}>
              {([
                ["colour", "Colour", "Branded, best on screen"],
                ["white", "White", "Plain, print-friendly"],
              ] as const).map(([key, label, hint]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStyle(key)}
                  style={{ ...d.styleOpt, ...(style === key ? d.styleOptOn : {}) }}
                >
                  <b>{label}</b>
                  <span style={{ fontSize: 11, color: "var(--mute)", fontWeight: 400 }}>{hint}</span>
                </button>
              ))}
            </div>

            <div style={d.label}>Message</div>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} style={{ ...d.input, resize: "vertical", fontFamily: "inherit" }} />

            <label style={d.check}>
              <input type="checkbox" checked={showInApp} onChange={(e) => setShowInApp(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
              Also show it in {firstName}&apos;s app (Reports tab)
            </label>

            <div style={d.hint}>
              They&apos;ll get a short email with the headline numbers and a button to the full report. The link works for 90 days, and
              replies come straight to you.
            </div>

            {error && <div style={d.error}>{error}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button style={{ ...d.primaryBtn, flex: 1, opacity: sending ? 0.7 : 1 }} disabled={sending} onClick={() => share(true)}>
                {sending ? "Sending…" : "Send email"}
              </button>
              <button style={d.ghostBtn} disabled={sending} onClick={() => share(false)} title="Create the link without emailing it">
                Just get link
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const d: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  panel: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, width: "100%", maxWidth: 460, padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,.4)" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: "var(--text)" },
  close: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 24, cursor: "pointer", lineHeight: 1 },
  label: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "14px 0 6px" },
  input: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "10px 12px", fontSize: 14, boxSizing: "border-box" },
  check: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)", marginTop: 8 },
  hint: { fontSize: 12, color: "var(--mute)", marginTop: 12, lineHeight: 1.45 },
  error: { fontSize: 13, color: "#FF6B6B", background: "#2a0c0c", border: "1px solid #FF6B6B44", borderRadius: 8, padding: "8px 10px", marginTop: 12 },
  success: { fontSize: 14, fontWeight: 700, color: "#1baf7a", marginTop: 6 },
  warn: { fontSize: 13, color: "#F59E0B", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 8, padding: "10px 12px", marginTop: 6, lineHeight: 1.45 },
  styleOpt: { flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 9, padding: "9px 11px", fontSize: 13, cursor: "pointer", textAlign: "left" },
  styleOptOn: { borderColor: "var(--accent)", background: "var(--accent-dim)" },
  linkRow: { display: "flex", gap: 8 },
  primaryBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 9, padding: "11px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 9, padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center" },
};

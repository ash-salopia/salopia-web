"use client";

import { useEffect, useRef, useState } from "react";

// Help page "Speak to an agent" panel. An AI assistant that answers from
// the help articles (app/api/support-agent), with "Email support" always
// one tap away for anything it can't solve.

const SUPPORT_EMAIL = "support@visbuild.co.uk";

type Msg = {
  role: "user" | "assistant";
  content: string;
  sources?: { id: string; title: string }[];
  error?: boolean;
};

// inline **bold** → <strong>, and keep line breaks
function RichLine({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} style={{ color: "var(--text)" }}>{p.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

function mailtoHref(messages: Msg[]): string {
  const transcript = messages
    .filter((m) => !m.error)
    .map((m) => `${m.role === "user" ? "Me" : "Assistant"}: ${m.content}`)
    .join("\n\n");
  const body =
    "Hi VIS BUILD support,\n\n[Describe your problem here]\n\n" +
    (transcript ? `--- What I asked the help assistant ---\n${transcript}`.slice(0, 1600) : "");
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Support request")}&body=${encodeURIComponent(body)}`;
}

export default function SupportAgentChat({
  initialQuestion,
  onOpenArticle,
  onClose,
}: {
  initialQuestion?: string;
  onOpenArticle: (id: string) => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState(initialQuestion ?? "");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/support-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          messages: next.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The assistant isn't available right now.");
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer, sources: data.sources }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: err instanceof Error ? err.message : "Something went wrong.", error: true },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.panel} onClick={(e) => e.stopPropagation()}>
        <div style={s.head}>
          <div>
            <div style={s.title}>Support assistant</div>
            <div style={s.sub}>AI answers from our help articles. It can make mistakes, so check the linked article.</div>
          </div>
          <button style={s.close} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div ref={scrollRef} style={s.thread}>
          {!messages.length && (
            <div style={s.empty}>Ask anything about using VIS BUILD, e.g. &ldquo;How do I copy a session to next week?&rdquo;</div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={m.role === "user" ? s.userMsg : { ...s.botMsg, ...(m.error ? s.errMsg : {}) }}>
              {m.content.split("\n").map((line, j) => (
                <div key={j} style={{ minHeight: line ? undefined : 8 }}>
                  <RichLine text={line} />
                </div>
              ))}
              {!!m.sources?.length && (
                <div style={s.sources}>
                  {m.sources.map((src) => (
                    <button key={src.id} style={s.sourceBtn} onClick={() => onOpenArticle(src.id)}>
                      📄 {src.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {busy && <div style={{ ...s.botMsg, color: "var(--mute)" }}>Thinking…</div>}
        </div>

        <form style={s.inputRow} onSubmit={send}>
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question…"
            style={s.input}
            maxLength={1500}
          />
          <button type="submit" style={{ ...s.sendBtn, opacity: busy || !input.trim() ? 0.5 : 1 }} disabled={busy || !input.trim()}>
            Send
          </button>
        </form>

        <div style={s.footer}>
          Still stuck?{" "}
          <a href={mailtoHref(messages)} style={s.footerLink}>
            Email support
          </a>{" "}
          and a person will get back to you. Your conversation is included automatically.
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.6)", display: "flex", alignItems: "flex-end", justifyContent: "flex-end", zIndex: 90, padding: 16 },
  panel: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, width: "100%", maxWidth: 420, height: "min(640px, calc(100vh - 32px))", display: "flex", flexDirection: "column", overflow: "hidden" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--line)" },
  title: { fontSize: 15, fontWeight: 700, color: "var(--text)" },
  sub: { fontSize: 11.5, color: "var(--mute)", marginTop: 3, lineHeight: 1.4 },
  close: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 22, lineHeight: 1, cursor: "pointer", padding: 0 },
  thread: { flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 },
  empty: { fontSize: 13, color: "var(--mute)", lineHeight: 1.5, padding: "8px 2px" },
  userMsg: { alignSelf: "flex-end", maxWidth: "85%", background: "var(--accent-dim)", border: "1px solid var(--accent)", color: "var(--text)", borderRadius: "12px 12px 2px 12px", padding: "8px 12px", fontSize: 13, lineHeight: 1.5 },
  botMsg: { alignSelf: "flex-start", maxWidth: "92%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: "12px 12px 12px 2px", padding: "10px 12px", fontSize: 13, lineHeight: 1.55 },
  errMsg: { borderColor: "#FF6B6B44", color: "#FF6B6B" },
  sources: { display: "flex", flexDirection: "column", gap: 4, marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--line)" },
  sourceBtn: { textAlign: "left", background: "transparent", border: "none", color: "var(--accent)", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 },
  inputRow: { display: "flex", gap: 8, padding: "10px 12px", borderTop: "1px solid var(--line)" },
  input: { flex: 1, minWidth: 0, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "inherit" },
  sendBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "0 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  footer: { fontSize: 12, color: "var(--mute)", padding: "0 14px 12px", lineHeight: 1.5 },
  footerLink: { color: "var(--accent)", fontWeight: 600, textDecoration: "none" },
};

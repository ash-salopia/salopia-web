"use client";

import { useEffect, useRef, useState } from "react";

// "Speak to an agent" / "Need Help?" panel. An AI assistant that answers
// from the help articles (app/api/support-agent), with 👍/👎 on each
// answer and "Email support" (app/api/support-request) always one tap
// away for anything it can't solve.

type Msg = {
  role: "user" | "assistant";
  content: string;
  id?: string | null; // support_agent_messages row, for 👍/👎
  sources?: { id: string; title: string }[];
  helpful?: boolean;
  error?: boolean;
};

// inline **bold** → <strong>
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

function transcriptOf(messages: Msg[]): string {
  return messages
    .filter((m) => !m.error)
    .map((m) => `${m.role === "user" ? "Coach" : "Assistant"}: ${m.content}`)
    .join("\n\n");
}

export default function SupportAgentChat({
  initialQuestion,
  page,
  onOpenArticle,
  onClose,
}: {
  initialQuestion?: string;
  /** Current pathname, so answers favour that part of the app. */
  page?: string;
  onOpenArticle: (id: string) => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState(initialQuestion ?? "");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"chat" | "email" | "sent">("chat");
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
          page,
          messages: next.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The assistant isn't available right now.");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer, sources: data.sources, id: data.id },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: err instanceof Error ? err.message : "Something went wrong.", error: true },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const rate = (index: number, helpful: boolean) => {
    const msg = messages[index];
    if (!msg?.id || msg.helpful === helpful) return;
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, helpful } : m)));
    fetch("/api/support-agent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ id: msg.id, helpful }),
    }).catch(() => {});
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.panel} onClick={(e) => e.stopPropagation()}>
        <div style={s.head}>
          <div>
            <div style={s.title}>{mode === "chat" ? "Support assistant" : "Email support"}</div>
            <div style={s.sub}>
              {mode === "chat"
                ? "AI answers from our help articles. It can make mistakes, so check the linked article."
                : "A real person will reply to your account email."}
            </div>
          </div>
          <button style={s.close} onClick={onClose} aria-label="Close">×</button>
        </div>

        {mode === "chat" ? (
          <>
            <div ref={scrollRef} style={s.thread}>
              {!messages.length && (
                <div style={s.empty}>
                  Ask anything about using VIS BUILD, e.g. &ldquo;How do I copy a session to next week?&rdquo;
                </div>
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
                  {m.role === "assistant" && m.id && (
                    <div style={s.rateRow}>
                      <span>{m.helpful === undefined ? "Was this helpful?" : m.helpful ? "Thanks!" : "Sorry about that."}</span>
                      <button
                        style={{ ...s.rateBtn, ...(m.helpful === true ? s.rateBtnOn : {}) }}
                        onClick={() => rate(i, true)}
                        aria-label="Helpful"
                      >
                        👍
                      </button>
                      <button
                        style={{ ...s.rateBtn, ...(m.helpful === false ? s.rateBtnOn : {}) }}
                        onClick={() => rate(i, false)}
                        aria-label="Not helpful"
                      >
                        👎
                      </button>
                      {m.helpful === false && (
                        <button style={s.inlineLink} onClick={() => setMode("email")}>
                          Email support
                        </button>
                      )}
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
              <button
                type="submit"
                style={{ ...s.sendBtn, opacity: busy || !input.trim() ? 0.5 : 1 }}
                disabled={busy || !input.trim()}
              >
                Send
              </button>
            </form>

            <div style={s.footer}>
              Still stuck?{" "}
              <button style={s.inlineLink} onClick={() => setMode("email")}>
                Email support
              </button>{" "}
              and a person will get back to you.
            </div>
          </>
        ) : mode === "email" ? (
          <SupportRequestForm
            transcript={transcriptOf(messages)}
            page={page}
            onBack={() => setMode("chat")}
            onSent={() => setMode("sent")}
          />
        ) : (
          <div style={s.sentBox}>
            <div style={{ fontSize: 28 }}>✅</div>
            <div style={s.title}>Sent - thanks!</div>
            <div style={s.sub}>We&apos;ll reply to your account email as soon as we can.</div>
            <button style={s.sendBtn} onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

function SupportRequestForm({
  transcript,
  page,
  onBack,
  onSent,
}: {
  transcript: string;
  page?: string;
  onBack: () => void;
  onSent: () => void;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/support-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ message, transcript, page }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't send that.");
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that.");
      setBusy(false);
    }
  };

  return (
    <form style={s.form} onSubmit={submit}>
      <label style={s.formLabel}>
        What do you need help with?
        <textarea
          autoFocus
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          style={s.textarea}
          rows={6}
          maxLength={4000}
          placeholder="What were you trying to do, and what happened instead? Mention the athlete involved, if any."
        />
      </label>
      {transcript && <div style={s.formNote}>Your conversation with the assistant is included automatically.</div>}
      {error && <div style={s.formError}>{error}</div>}
      <div style={s.formBtns}>
        <button type="button" style={s.backBtn} onClick={onBack} disabled={busy}>
          ← Back
        </button>
        <button
          type="submit"
          style={{ ...s.sendBtn, padding: "10px 18px", opacity: busy || !message.trim() ? 0.5 : 1 }}
          disabled={busy || !message.trim()}
        >
          {busy ? "Sending…" : "Send to support"}
        </button>
      </div>
    </form>
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
  rateRow: { display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 11.5, color: "var(--mute)", flexWrap: "wrap" },
  rateBtn: { background: "transparent", border: "1px solid var(--line)", borderRadius: 8, padding: "2px 7px", fontSize: 13, cursor: "pointer", opacity: 0.7 },
  rateBtnOn: { borderColor: "var(--accent)", background: "var(--accent-dim)", opacity: 1 },
  inputRow: { display: "flex", gap: 8, padding: "10px 12px", borderTop: "1px solid var(--line)" },
  input: { flex: 1, minWidth: 0, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "inherit" },
  sendBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "0 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  footer: { fontSize: 12, color: "var(--mute)", padding: "0 14px 12px", lineHeight: 1.5 },
  inlineLink: { background: "transparent", border: "none", padding: 0, color: "var(--accent)", fontWeight: 600, fontSize: "inherit", cursor: "pointer", fontFamily: "inherit" },
  form: { flex: 1, display: "flex", flexDirection: "column", gap: 10, padding: 16, overflowY: "auto" },
  formLabel: { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--text)" },
  textarea: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", resize: "vertical", fontWeight: 400 },
  formNote: { fontSize: 12, color: "var(--mute)" },
  formError: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "8px 12px", fontSize: 13 },
  formBtns: { display: "flex", justifyContent: "space-between", gap: 10, marginTop: "auto" },
  backBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  sentBox: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 24, textAlign: "center" },
};

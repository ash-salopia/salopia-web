"use client";

import { useEffect, useState } from "react";
import { getAthleteDeleteAccess } from "@/lib/data/athletes";

// Owner-only: set or change the org's athlete-delete password (0114).
// The hash never reaches the browser - this only knows whether one is set.
export default function DeletePasswordSettings({ isOwner }: { isOwner: boolean }) {
  const [passwordSet, setPasswordSet] = useState<boolean | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    getAthleteDeleteAccess().then((a) => setPasswordSet(a.passwordSet)).catch(() => setPasswordSet(false));
  }, []);

  const save = async () => {
    setMsg(null);
    if (next !== confirm) {
      setMsg({ ok: false, text: "The new passwords don't match." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/settings/delete-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: next, currentPassword: current }),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save the delete password.");
      setPasswordSet(true);
      setCurrent(""); setNext(""); setConfirm("");
      setMsg({ ok: true, text: "Delete password saved." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save the delete password." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.label}>Delete password</div>
      <div style={s.desc}>
        {passwordSet === null
          ? "Checking…"
          : passwordSet
            ? "A delete password is set. Anyone deleting an athlete (or undoing a roster import) has to type it in."
            : "No delete password is set yet, so nobody can permanently delete athletes. Set one to turn deleting on."}
      </div>
      {isOwner && passwordSet !== null && (
        <div style={s.fields}>
          {passwordSet && (
            <input type="password" autoComplete="off" placeholder="Current delete password" value={current} onChange={(e) => setCurrent(e.target.value)} style={s.input} />
          )}
          <input type="password" autoComplete="new-password" placeholder={passwordSet ? "New delete password" : "Delete password"} value={next} onChange={(e) => setNext(e.target.value)} style={s.input} />
          <input type="password" autoComplete="new-password" placeholder="Type it again" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={s.input} />
          <button type="button" style={{ ...s.btn, opacity: busy || !next ? 0.5 : 1 }} disabled={busy || !next} onClick={save}>
            {busy ? "Saving…" : passwordSet ? "Change password" : "Set password"}
          </button>
        </div>
      )}
      {msg && <div style={{ ...s.msg, color: msg.ok ? "var(--good)" : "#FF6B6B" }}>{msg.text}</div>}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 8 },
  label: { fontSize: 15, fontWeight: 700, color: "var(--text)" },
  desc: { fontSize: 13, color: "var(--mute)", lineHeight: 1.5 },
  fields: { display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 },
  input: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14, fontFamily: "inherit" },
  btn: { alignSelf: "flex-start", background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  msg: { fontSize: 13 },
};

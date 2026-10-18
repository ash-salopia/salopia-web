"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";

// Athlete's recurring setup note for one exercise (0125) - shown under
// the exercise every session it appears in. Read-only until "Setup" is
// tapped; saving an empty note removes it.

export function useExerciseSetups(token: string) {
  const [setups, setSetups] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!token) return;
    fetch(`/api/athlete-link/exercise-setups?token=${token}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const map: Record<string, string> = {};
        for (const s of d.setups ?? []) map[s.exercise_key] = s.note;
        setSetups(map);
      })
      .catch(() => {});
  }, [token]);

  const save = async (exerciseName: string, note: string) => {
    const key = exerciseName.trim().toLowerCase();
    const before = setups[key];
    setSetups((m) => {
      const next = { ...m };
      if (note.trim()) next[key] = note.trim();
      else delete next[key];
      return next;
    });
    const res = await fetch("/api/athlete-link/exercise-setups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ token, exerciseName, note }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setSetups((m) => ({ ...m, ...(before ? { [key]: before } : {}) }));
      throw new Error("Couldn't save your setup note - check your connection and try again.");
    }
  };

  return { get: (name: string) => setups[name.trim().toLowerCase()] ?? "", save };
}

export default function ExerciseSetupNote({
  exerciseName,
  note,
  editing,
  onEditingChange,
  onSave,
}: {
  exerciseName: string;
  note: string;
  editing: boolean;
  onEditingChange: (v: boolean) => void;
  onSave: (exerciseName: string, note: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(note);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) {
      setDraft(note);
      setTimeout(() => ref.current?.focus(), 30);
    }
  }, [editing, note]);

  if (!editing) {
    if (!note) return null;
    return (
      <button style={st.view} onClick={() => onEditingChange(true)} title="Edit your setup note">
        <Icon name="wrench" size={13} style={{ color: "var(--accent)", marginTop: 2 }} />
        <span style={{ flex: 1, textAlign: "left" }}>
          <span style={st.viewLabel}>My setup</span> {note}
        </span>
      </button>
    );
  }

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave(exerciseName, draft);
      onEditingChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={st.box}>
      <div style={st.boxLabel}>My setup for {exerciseName}</div>
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Seat height, pin, grip, stance… shown every time this exercise comes up"
        style={st.input}
      />
      {error && <div style={st.error}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={st.save} onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        <button style={st.cancel} onClick={() => onEditingChange(false)} disabled={saving}>Cancel</button>
        {note && (
          <button style={{ ...st.cancel, marginLeft: "auto", color: "#FF6B6B" }} disabled={saving} onClick={() => { setDraft(""); onSave(exerciseName, "").then(() => onEditingChange(false)).catch((e) => setError(e.message)); }}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  view: { display: "flex", gap: 7, alignItems: "flex-start", width: "100%", background: "var(--accent-dim)", border: "1px solid var(--line)", borderRadius: 8, padding: "7px 10px", marginTop: 8, fontSize: 12.5, color: "var(--text)", lineHeight: 1.4, cursor: "pointer", whiteSpace: "pre-wrap" },
  viewLabel: { fontWeight: 800, color: "var(--accent)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", marginRight: 4 },
  box: { marginTop: 8, display: "flex", flexDirection: "column", gap: 8, background: "var(--ink)", border: "1px solid var(--accent)", borderRadius: 10, padding: 10 },
  boxLabel: { fontSize: 11, fontWeight: 800, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.04em" },
  input: { width: "100%", background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" },
  error: { fontSize: 12, color: "#FF6B6B" },
  save: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer" },
  cancel: { background: "transparent", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer" },
};

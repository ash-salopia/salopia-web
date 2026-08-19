"use client";

// Athlete checklist for assigning a restricted coach's roster - the
// checklist/search shape is modeled on the "multiple" mode of
// components/reports/ReportTargetPicker.tsx, simplified since there's
// no single/group mode needed here.

import { useEffect, useState } from "react";
import { listAthletes } from "@/lib/data/athletes";
import { listCoachAssignedAthleteIds, setCoachAssignedAthletes } from "@/lib/data/coach-access";
import type { Athlete } from "@/types";

interface Props {
  coachId: string;
  coachName: string;
  onClose: () => void;
  onSaved: (count: number) => void;
}

export default function CoachAthleteAssignModal({ coachId, coachName, onClose, onSaved }: Props) {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([listAthletes(), listCoachAssignedAthleteIds(coachId)])
      .then(([a, ids]) => { setAthletes(a); setSelectedIds(ids); })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load athletes"))
      .finally(() => setLoading(false));
  }, [coachId]);

  const toggleAthlete = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await setCoachAssignedAthletes(coachId, selectedIds);
      onSaved(selectedIds.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save assignments");
      setSaving(false);
    }
  };

  const filteredAthletes = search.trim()
    ? athletes.filter((a) => a.name.toLowerCase().includes(search.trim().toLowerCase()))
    : athletes;

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.title}>Assign athletes</div>
        <div style={s.desc}>{coachName || "This coach"} will only see and edit the athletes checked below.</div>

        {error && <div style={s.error}>{error}</div>}

        {loading ? (
          <div style={s.empty}>Loading athletes…</div>
        ) : (
          <>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search athletes…"
              style={s.input}
            />
            <div style={s.checkList}>
              {filteredAthletes.length === 0 ? (
                <div style={s.emptySmall}>No athletes match &quot;{search}&quot;.</div>
              ) : (
                filteredAthletes.map((a) => (
                  <label key={a.id} style={s.checkRow}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(a.id)}
                      onChange={() => toggleAthlete(a.id)}
                      style={{ accentColor: "var(--accent)" }}
                    />
                    {a.name}
                  </label>
                ))
              )}
            </div>
            <div style={s.summary}>{selectedIds.length} athlete{selectedIds.length !== 1 ? "s" : ""} selected</div>
          </>
        )}

        <div style={s.actions}>
          <button style={s.ghostBtn} onClick={onClose}>Cancel</button>
          <button style={{ ...s.saveBtn, opacity: saving || loading ? 0.6 : 1 }} disabled={saving || loading} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: 24, width: 380, maxWidth: "90vw", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" },
  title: { fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 4 },
  desc: { fontSize: 12, color: "var(--mute)", marginBottom: 16 },
  error: { background: "#2a0c0c", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12 },
  empty: { fontSize: 13, color: "var(--mute)", fontStyle: "italic" },
  emptySmall: { fontSize: 12, color: "var(--mute)", padding: "8px 4px" },
  input: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14, boxSizing: "border-box" as const, marginBottom: 8 },
  checkList: { display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" as const, border: "1px solid var(--line)", borderRadius: 8, padding: 8 },
  checkRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)", cursor: "pointer", padding: "4px 4px" },
  summary: { fontSize: 12, color: "var(--mute)", marginTop: 8 },
  actions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  saveBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
};

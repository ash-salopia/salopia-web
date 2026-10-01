"use client";

// ============================================================
// Shared tickable-chip category picker for note templates.
// Used by both the /templates management page and the quick
// "Save as template" form inside SessionNotesBlock, so the two
// stay in sync rather than drifting into two separate category
// lists (0109 — "general" removed: a template now always
// explicitly lists every Session Notes/Warm-up/Cool-down picker
// it should show up in, e.g. "Strength" + "Power / Speed",
// rather than a catch-all "show everywhere" option).
// ============================================================

import type { NoteCategory } from "@/lib/data/note-templates";

export const CATEGORIES: NoteCategory[] = ["warm_up", "cool_down", "strength", "power_speed", "cardio", "hyrox", "sport", "recovery"];

export const CATEGORY_LABELS: Record<NoteCategory, string> = {
  warm_up: "Warm-Up",
  cool_down: "Cool-Down",
  strength: "Strength",
  power_speed: "Power / Speed",
  cardio: "Cardio",
  hyrox: "Hybrid",
  sport: "Sport",
  recovery: "Recovery",
};

export default function NoteCategoryPicker({ selected, onChange }: { selected: NoteCategory[]; onChange: (next: NoteCategory[]) => void }) {
  const toggle = (cat: NoteCategory) =>
    onChange(selected.includes(cat) ? selected.filter(c => c !== cat) : [...selected, cat]);
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
      {CATEGORIES.map(cat => {
        const on = selected.includes(cat);
        return (
          <button key={cat} type="button" onClick={() => toggle(cat)}
            style={{
              background: on ? "var(--accent-dim)" : "var(--ink)",
              border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`,
              color: on ? "var(--accent)" : "var(--mute)",
              borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>
            {CATEGORY_LABELS[cat]}
          </button>
        );
      })}
    </div>
  );
}

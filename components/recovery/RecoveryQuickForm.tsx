"use client";

import type { RecoveryCategory, RecoveryConfig } from "@/types";
import { RECOVERY_CATEGORIES, RECOVERY_INTENSITIES } from "@/lib/recovery-constants";

// The "Quick Prescription" field group — deliberately just a handful
// of plain fields (no sets/reps anywhere) so a coach can prescribe
// rest, a walk, a sleep target etc. in well under 30 seconds. Reused
// both when creating a session (RecoverySessionModal) and editing an
// existing one (RecoverySessionEditor) — athleteNotes/completion are
// only ever shown in the latter context, since there's nothing to
// show yet at creation time.
export default function RecoveryQuickForm({
  name,
  onNameChange,
  category,
  onCategoryChange,
  config,
  onConfigChange,
  athleteNotes,
}: {
  name: string;
  onNameChange: (v: string) => void;
  category: RecoveryCategory | null;
  onCategoryChange: (v: RecoveryCategory | null) => void;
  config: RecoveryConfig;
  onConfigChange: (patch: Partial<RecoveryConfig>) => void;
  athleteNotes?: string | null;
}) {
  return (
    <div style={s.wrap}>
      <div>
        <label style={s.label}>Session title</label>
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Recovery walk"
          style={s.input}
        />
      </div>

      <div>
        <label style={s.label}>Recovery category</label>
        <select
          value={category ?? ""}
          onChange={(e) => onCategoryChange((e.target.value || null) as RecoveryCategory | null)}
          style={s.input}
        >
          <option value="">— Select —</option>
          {RECOVERY_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        {category === "custom" && (
          <input
            value={config.custom_category_label ?? ""}
            onChange={(e) => onConfigChange({ custom_category_label: e.target.value })}
            placeholder="Name this category…"
            style={{ ...s.input, marginTop: 6 }}
          />
        )}
      </div>

      <div>
        <label style={s.label}>Coach instructions</label>
        <textarea
          value={config.instructions ?? ""}
          onChange={(e) => onConfigChange({ instructions: e.target.value })}
          placeholder="What should the athlete do? e.g. 20 min easy walk, keep heart rate low."
          rows={3}
          style={{ ...s.input, resize: "vertical" as const, fontFamily: "inherit" }}
        />
      </div>

      <div style={s.row}>
        <div style={{ flex: 1 }}>
          <label style={s.label}>Suggested duration (min)</label>
          <input
            type="number"
            inputMode="numeric"
            value={config.duration_minutes ?? ""}
            onChange={(e) => onConfigChange({ duration_minutes: e.target.value ? parseInt(e.target.value, 10) : null })}
            placeholder="e.g. 20"
            style={s.input}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={s.label}>Suggested intensity</label>
          <select
            value={config.intensity ?? ""}
            onChange={(e) => onConfigChange({ intensity: (e.target.value || null) as any })}
            style={s.input}
          >
            <option value="">— None —</option>
            {RECOVERY_INTENSITIES.map((i) => (
              <option key={i.value} value={i.value}>{i.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label style={s.label}>Optional media (video/image URL)</label>
        <input
          value={config.media_url ?? ""}
          onChange={(e) => onConfigChange({ media_url: e.target.value })}
          placeholder="https://…"
          style={s.input}
        />
      </div>

      <label style={s.checkRow}>
        <input
          type="checkbox"
          checked={!!config.request_feedback}
          onChange={(e) => onConfigChange({ request_feedback: e.target.checked })}
          style={{ accentColor: "#2DD4BF" }}
        />
        <span>Ask the athlete for feedback (recovery/soreness/fatigue) when they finish</span>
      </label>

      {athleteNotes !== undefined && (
        <div>
          <label style={s.label}>Completion status</label>
          <div style={s.statusBadge}>
            {config.completed ? "✓ Marked done by athlete" : "Not yet completed"}
          </div>
        </div>
      )}

      {athleteNotes !== undefined && athleteNotes && (
        <div>
          <label style={s.label}>Athlete notes</label>
          <div style={s.readonlyNote}>{athleteNotes}</div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 14 },
  row: { display: "flex", gap: 10 },
  label: { display: "block", fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 5 },
  input: {
    width: "100%", background: "var(--ink)", border: "1px solid var(--line)",
    color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14, boxSizing: "border-box" as const,
  },
  checkRow: { display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "var(--text)", cursor: "pointer" },
  statusBadge: { fontSize: 13, color: "var(--mute)", background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 12px" },
  readonlyNote: { fontSize: 13, color: "var(--text)", background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 12px" },
};

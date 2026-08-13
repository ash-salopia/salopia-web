"use client";

import { recoveryCategoryLabel } from "@/lib/recovery-constants";
import type { PrescribedExercise, RecoveryCategory, RecoveryConfig, RecoveryFormat, SessionType } from "@/types";

const DOW = [
  { v: 1, label: "Mon" },
  { v: 2, label: "Tue" },
  { v: 3, label: "Wed" },
  { v: 4, label: "Thu" },
  { v: 5, label: "Fri" },
  { v: 6, label: "Sat" },
  { v: 0, label: "Sun" },
];

const TYPE_LABEL: Record<string, string> = {
  strength: "Strength", hyrox: "Hyrox", cardio: "Cardio", power_speed: "Power / Speed", recovery: "Recovery",
};

// Mirrors the label sets in HyroxCardioBuilder — kept local since
// those aren't exported and this is read-only display, not editing.
const HYROX_TYPE_LABEL: Record<string, string> = {
  fixed: "Fixed Workout", cycling: "Cycling Intervals", emom: "EMOM", interval: "Intervals", circuit: "Circuit / AMRAP",
};
const CARDIO_TYPE_LABEL: Record<string, string> = {
  continuous: "Continuous / LSD", threshold: "Threshold / Tempo", cardioIntervals: "Intervals / VO2max", overUnder: "Over-Unders",
};

// Minimal shape shared by TemplateDef and ProgrammeSession, same
// pattern the old SessionDefEditor used - both are "session
// structures with no date yet", differing only in that a template def
// can repeat on weekdays and a programme session can't.
export interface SessionDefLike {
  name: string;
  type: SessionType;
  exercises: PrescribedExercise[];
  hyrox_type: string | null;
  hyrox_config: unknown;
  cardio_type: string | null;
  cardio_config: unknown;
  recovery_category: RecoveryCategory | null;
  recovery_format: RecoveryFormat | null;
  recovery_config: RecoveryConfig;
  notes: string;
  days?: number[]; // present (and shown) on template defs only
}

function recoveryLine(def: SessionDefLike): string {
  const config: any = def.recovery_config ?? {};
  const parts: string[] = [recoveryCategoryLabel(def.recovery_category, config.custom_category_label)];
  if (config.duration_minutes != null) parts.push(`${config.duration_minutes} min`);
  const itemCount = (config.blocks?.length ?? 0) + (config.checklist_items?.length ?? 0);
  if (itemCount > 0) parts.push(`${itemCount} ${itemCount === 1 ? "item" : "items"}`);
  if (config.request_feedback) parts.push("📋 feedback");
  return parts.join(" · ");
}

function hyroxStepCount(config: unknown): number | null {
  const c = config as any;
  if (!c) return null;
  const arr = c.steps ?? c.exercises ?? c.slots;
  return Array.isArray(arr) ? arr.length : null;
}

// Read-only counterpart to the old SessionDefEditor - Templates and
// Programmes no longer build session content in place (everything is
// built in the athlete session builder and saved as a template/
// programme), so their detail pages just need to show what's there.
export default function SessionDefView({ def }: { def: SessionDefLike }) {
  const exercises = def.exercises ?? [];
  const showDays = def.days !== undefined;

  return (
    <div style={styles.pane}>
      <div style={styles.headRow}>
        <div style={styles.name}>{def.name}</div>
        <div style={styles.typeTag}>{TYPE_LABEL[def.type] ?? def.type}</div>
      </div>

      {showDays && (
        <div style={styles.daysLine}>
          {def.days && def.days.length
            ? `Repeats: ${DOW.filter((d) => def.days!.includes(d.v)).map((d) => d.label).join(", ")}`
            : "Loads once, on the chosen start date"}
        </div>
      )}

      {def.notes?.trim() && (
        <div style={styles.notesBox}>
          <div style={styles.notesLabel}>Coach notes</div>
          <div style={styles.notesText}>{def.notes}</div>
        </div>
      )}

      {(def.type === "strength" || def.type === "power_speed") &&
        (exercises.length ? (
          <div style={styles.exList}>
            {exercises.map((ex, i) => (
              <div key={ex.id ?? i} style={styles.exRow}>
                <span style={styles.exName}>{ex.name || "Untitled"}</span>
                <span style={styles.exMeta}>
                  {def.type === "strength"
                    ? `${ex.sets}× ${ex.reps || ex.time || "-"}${
                        ex.use_percent_1rm && ex.set_percents?.length
                          ? ` @ ${ex.set_percents.join("/")}%`
                          : ex.target_load
                          ? ` @ ${ex.target_load}`
                          : ""
                      }`
                    : `${ex.sets} sets`}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={styles.empty}>No exercises.</div>
        ))}

      {def.type === "recovery" && <div style={styles.summaryLine}>{recoveryLine(def)}</div>}

      {def.type === "hyrox" && (
        <div style={styles.summaryLine}>
          {HYROX_TYPE_LABEL[def.hyrox_type ?? ""] ?? "Hyrox"}
          {hyroxStepCount(def.hyrox_config) != null ? ` · ${hyroxStepCount(def.hyrox_config)} exercises` : ""}
        </div>
      )}

      {def.type === "cardio" && (
        <div style={styles.summaryLine}>{CARDIO_TYPE_LABEL[def.cardio_type ?? ""] ?? "Cardio"}</div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pane: { flex: 1, minWidth: 0, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 12 },
  headRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  name: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  typeTag: { fontSize: 11, fontWeight: 700, color: "var(--mute)", background: "var(--panel2)", borderRadius: 6, padding: "3px 8px", textTransform: "capitalize" },
  daysLine: { fontSize: 12, color: "var(--mute)" },
  notesBox: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px" },
  notesLabel: { fontSize: 10, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 },
  notesText: { fontSize: 13, color: "var(--text)", lineHeight: 1.5, whiteSpace: "pre-wrap" },
  exList: { display: "flex", flexDirection: "column", gap: 6 },
  exRow: { display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, background: "var(--ink)", borderRadius: 7, padding: "8px 10px" },
  exName: { color: "var(--text)", fontWeight: 600 },
  exMeta: { color: "var(--mute)", flexShrink: 0 },
  summaryLine: { fontSize: 13, color: "var(--text)", background: "var(--ink)", borderRadius: 8, padding: "10px 12px" },
  empty: { fontSize: 13, color: "var(--mute)", fontStyle: "italic" },
};

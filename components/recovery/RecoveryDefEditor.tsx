"use client";

import RecoveryQuickForm from "@/components/recovery/RecoveryQuickForm";
import RecoveryBlockBuilder from "@/components/recovery/RecoveryBlockBuilder";
import RecoveryChecklistItemsEditor from "@/components/recovery/RecoveryChecklistItemsEditor";
import type { RecoveryCategory, RecoveryConfig, RecoveryFormat } from "@/types";

const FORMAT_CARDS: { key: RecoveryFormat; title: string; desc: string }[] = [
  { key: "quick", title: "Quick Prescription", desc: "A few fields - instructions, duration, intensity. Built for speed." },
  { key: "guided", title: "Guided Recovery Routine", desc: "A block-based routine - instructions, mobility drills, timed activities, checklists, media." },
  { key: "checklist", title: "Recovery Checklist", desc: "Tappable behaviours - hydration, walking, mobility, nutrition, sleep targets." },
];

// Minimal shape shared by TemplateDef and ProgrammeSession - both carry
// the same recovery columns, so this editor works unmodified for either.
export interface RecoveryDefLike {
  name: string;
  recovery_category: RecoveryCategory | null;
  recovery_format: RecoveryFormat | null;
  recovery_config: RecoveryConfig;
}

// Recovery editor for a template def or programme session, mirroring
// RecoverySessionEditor's format-branched layout. Unlike a real session,
// a def has no id worth fetching feedback for and no format-switcher
// once chosen (same precedent as real sessions - format is picked once,
// up front).
export default function RecoveryDefEditor({
  def,
  onUpdate,
}: {
  def: RecoveryDefLike;
  onUpdate: (patch: Partial<RecoveryDefLike>) => void;
}) {
  const patchConfig = (patch: Partial<RecoveryConfig>) =>
    onUpdate({ recovery_config: { ...def.recovery_config, ...patch } });

  if (!def.recovery_format) {
    return (
      <div style={s.cardGrid}>
        {FORMAT_CARDS.map((c) => (
          <button key={c.key} style={s.formatCard} onClick={() => onUpdate({ recovery_format: c.key })}>
            <div style={s.formatTitle}>{c.title}</div>
            <div style={s.formatDesc}>{c.desc}</div>
          </button>
        ))}
      </div>
    );
  }

  const quickForm = (
    <RecoveryQuickForm
      name={def.name}
      onNameChange={(name) => onUpdate({ name })}
      category={def.recovery_category}
      onCategoryChange={(recovery_category) => onUpdate({ recovery_category })}
      config={def.recovery_config}
      onConfigChange={patchConfig}
    />
  );

  if (def.recovery_format === "guided") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {quickForm}
        <div>
          <div style={s.blockLabel}>Routine blocks</div>
          <RecoveryBlockBuilder
            blocks={def.recovery_config.blocks ?? []}
            onChange={(blocks) => patchConfig({ blocks })}
          />
        </div>
      </div>
    );
  }

  if (def.recovery_format === "checklist") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {quickForm}
        <div>
          <div style={s.blockLabel}>Checklist items</div>
          <RecoveryChecklistItemsEditor
            items={def.recovery_config.checklist_items ?? []}
            onChange={(checklist_items) => patchConfig({ checklist_items })}
          />
        </div>
      </div>
    );
  }

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{quickForm}</div>;
}

const s: Record<string, React.CSSProperties> = {
  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 },
  formatCard: { textAlign: "left", background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: 14, cursor: "pointer", display: "flex", flexDirection: "column", gap: 4 },
  formatTitle: { fontSize: 14, fontWeight: 700, color: "var(--text)" },
  formatDesc: { fontSize: 12, color: "var(--mute)", lineHeight: 1.4 },
  blockLabel: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 },
};

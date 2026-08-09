"use client";

import { useEffect, useState } from "react";
import RecoveryQuickForm from "@/components/recovery/RecoveryQuickForm";
import RecoveryBlockBuilder from "@/components/recovery/RecoveryBlockBuilder";
import RecoveryChecklistItemsEditor from "@/components/recovery/RecoveryChecklistItemsEditor";
import { getSessionFeedback } from "@/lib/data/recovery";
import type { RecoveryCategory, RecoveryConfig, Session, SessionFeedback } from "@/types";

const SCORE_LABELS: { key: "recovery_score" | "soreness" | "fatigue"; label: string }[] = [
  { key: "recovery_score", label: "Recovery" },
  { key: "soreness", label: "Soreness" },
  { key: "fatigue", label: "Fatigue" },
];

// Read-only, shown once the athlete has submitted their end-of-
// session feedback (only ever requested when
// recovery_config.request_feedback is true).
function FeedbackReadout({ sessionId }: { sessionId: string }) {
  const [feedback, setFeedback] = useState<SessionFeedback | null | undefined>(undefined);

  useEffect(() => {
    getSessionFeedback(sessionId).then(setFeedback).catch(() => setFeedback(null));
  }, [sessionId]);

  if (!feedback) return null;

  return (
    <div style={fs.card}>
      <div style={fs.title}>Athlete feedback</div>
      <div style={fs.scoreRow}>
        {SCORE_LABELS.map((s) => (
          <div key={s.key} style={fs.scoreChip}>
            <span style={fs.scoreLabel}>{s.label}</span>
            <span style={fs.scoreVal}>{feedback[s.key] ?? "-"}/5</span>
          </div>
        ))}
      </div>
      {feedback.pain_notes && (
        <div>
          <div style={fs.fieldLabel}>Pain / concerns</div>
          <div style={fs.fieldValue}>{feedback.pain_notes}</div>
        </div>
      )}
      {feedback.notes && (
        <div>
          <div style={fs.fieldLabel}>Notes</div>
          <div style={fs.fieldValue}>{feedback.notes}</div>
        </div>
      )}
    </div>
  );
}

const fs: Record<string, React.CSSProperties> = {
  card: { background: "var(--ink)", border: "1px solid #2DD4BF44", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 },
  title: { fontSize: 12, fontWeight: 700, color: "#2DD4BF", textTransform: "uppercase" as const, letterSpacing: "0.04em" },
  scoreRow: { display: "flex", gap: 10 },
  scoreChip: { display: "flex", flexDirection: "column", gap: 2, background: "var(--panel)", borderRadius: 8, padding: "6px 12px" },
  scoreLabel: { fontSize: 10, color: "var(--mute)", textTransform: "uppercase" as const },
  scoreVal: { fontSize: 15, fontWeight: 700, color: "var(--text)" },
  fieldLabel: { fontSize: 10, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, marginBottom: 2 },
  fieldValue: { fontSize: 13, color: "var(--text)" },
};

// Coach-side editor for an existing Recovery session, branched by
// recovery_format - mirrors the 3-way strength/power_speed/hyrox-
// cardio branch in the session builder page one level down.
export default function RecoverySessionEditor({
  session,
  onNameChange,
  onCategoryChange,
  onConfigChange,
}: {
  session: Session;
  onNameChange: (name: string) => void;
  onCategoryChange: (category: RecoveryCategory | null) => void;
  onConfigChange: (patch: Partial<RecoveryConfig>) => void;
}) {
  const feedbackReadout = session.recovery_config.request_feedback ? (
    <FeedbackReadout sessionId={session.id} />
  ) : null;

  if (session.recovery_format === "guided") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <RecoveryQuickForm
          name={session.name}
          onNameChange={onNameChange}
          category={session.recovery_category}
          onCategoryChange={onCategoryChange}
          config={session.recovery_config}
          onConfigChange={onConfigChange}
          athleteNotes={session.athlete_notes}
        />
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
            Routine blocks
          </div>
          <RecoveryBlockBuilder
            blocks={session.recovery_config.blocks ?? []}
            onChange={(blocks) => onConfigChange({ blocks })}
          />
        </div>
        {feedbackReadout}
      </div>
    );
  }

  if (session.recovery_format === "checklist") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <RecoveryQuickForm
          name={session.name}
          onNameChange={onNameChange}
          category={session.recovery_category}
          onCategoryChange={onCategoryChange}
          config={session.recovery_config}
          onConfigChange={onConfigChange}
          athleteNotes={session.athlete_notes}
        />
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
            Checklist items
          </div>
          <RecoveryChecklistItemsEditor
            items={session.recovery_config.checklist_items ?? []}
            onChange={(checklist_items) => onConfigChange({ checklist_items })}
          />
        </div>
        {feedbackReadout}
      </div>
    );
  }

  if (!session.recovery_format || session.recovery_format === "quick") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <RecoveryQuickForm
          name={session.name}
          onNameChange={onNameChange}
          category={session.recovery_category}
          onCategoryChange={onCategoryChange}
          config={session.recovery_config}
          onConfigChange={onConfigChange}
          athleteNotes={session.athlete_notes}
        />
        {feedbackReadout}
      </div>
    );
  }

  return (
    <div style={{ fontSize: 13, color: "var(--mute)", fontStyle: "italic", padding: "20px 0" }}>
      The {session.recovery_format} editor isn&apos;t built yet - coming in a follow-up update.
    </div>
  );
}

"use client";

import RecoveryQuickForm from "@/components/recovery/RecoveryQuickForm";
import type { RecoveryCategory, RecoveryConfig, Session } from "@/types";

// Coach-side editor for an existing Recovery session, branched by
// recovery_format — mirrors the 3-way strength/power_speed/hyrox-
// cardio branch in the session builder page one level down. Guided
// and Checklist land in later phases of this feature.
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
  if (!session.recovery_format || session.recovery_format === "quick") {
    return (
      <RecoveryQuickForm
        name={session.name}
        onNameChange={onNameChange}
        category={session.recovery_category}
        onCategoryChange={onCategoryChange}
        config={session.recovery_config}
        onConfigChange={onConfigChange}
        athleteNotes={session.athlete_notes}
      />
    );
  }

  return (
    <div style={{ fontSize: 13, color: "var(--mute)", fontStyle: "italic", padding: "20px 0" }}>
      The {session.recovery_format} editor isn&apos;t built yet — coming in a follow-up update.
    </div>
  );
}

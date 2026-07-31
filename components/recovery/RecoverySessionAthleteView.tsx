"use client";

import { useState } from "react";
import SessionNotesBlock from "@/components/SessionNotesBlock";
import { saveWithRetry } from "@/lib/save-queue";
import { recoveryCategoryLabel, RECOVERY_INTENSITIES, RECOVERY_COLOR } from "@/lib/recovery-constants";
import type { RecoveryConfig, Session } from "@/types";

export default function RecoverySessionAthleteView({
  session: initialSession,
  athleteName,
  token,
  onUpdated,
  onBack,
}: {
  session: Session;
  athleteName: string;
  token: string;
  onUpdated: () => void;
  onBack: () => void;
}) {
  const [session, setSession] = useState(initialSession);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const config: RecoveryConfig = session.recovery_config ?? {};
  const intensityLabel = RECOVERY_INTENSITIES.find((i) => i.value === config.intensity)?.label;

  // recovery_config round-trips whole, same as every other jsonb-blob
  // config in this codebase (hyrox_config, cardio_config) — merge
  // client-side, PATCH the full object.
  const patchConfig = async (patch: Partial<RecoveryConfig>) => {
    const next = { ...config, ...patch };
    setSession((prev) => ({ ...prev, recovery_config: next }));
    setSaving(true);
    const result = await saveWithRetry(`recovery:${session.id}`, "/api/athlete-link/recovery-update", {
      token,
      sessionId: session.id,
      recoveryConfig: next,
    });
    setSaving(false);
    if (!result.ok && !result.queued) setError(result.error);
    onUpdated();
  };

  const handleAthleteNotesChange = (athlete_notes: string) => setSession((prev) => ({ ...prev, athlete_notes }));
  const saveAthleteNotes = async () => {
    await saveWithRetry(`notes:${session.id}`, "/api/athlete-link/session-notes", {
      token,
      sessionId: session.id,
      notes: session.athlete_notes ?? "",
    });
  };

  const isQuick = !session.recovery_format || session.recovery_format === "quick";

  return (
    <div style={s.page}>
      <button style={s.backLink} onClick={onBack}>← Back to sessions</button>

      <div style={s.header}>
        <div style={s.categoryBadge}>
          {recoveryCategoryLabel(session.recovery_category, config.custom_category_label)}
        </div>
        <div style={s.sessionName}>{session.name}</div>
        <div style={s.sessionMeta}>{session.date} · {athleteName}</div>
      </div>

      {config.instructions && <div style={s.instructionsBox}>{config.instructions}</div>}

      {(config.duration_minutes != null || intensityLabel) && (
        <div style={s.metaRow}>
          {config.duration_minutes != null && <div style={s.metaChip}>⏱ {config.duration_minutes} min</div>}
          {intensityLabel && <div style={s.metaChip}>🔥 {intensityLabel} intensity</div>}
        </div>
      )}

      {config.media_url && (
        <a href={config.media_url} target="_blank" rel="noreferrer" style={s.mediaLink}>
          ▶ View media
        </a>
      )}

      {isQuick ? (
        <button
          disabled={saving}
          style={{ ...s.completeBtn, ...(config.completed ? s.completeBtnDone : {}) }}
          onClick={() => patchConfig({ completed: !config.completed })}
        >
          {config.completed ? "✓ Marked done" : "Mark as done"}
        </button>
      ) : (
        <div style={s.notBuilt}>This routine type isn&apos;t supported in the athlete app yet.</div>
      )}

      {error && <div style={s.error}>{error}</div>}

      <SessionNotesBlock
        value={session.athlete_notes ?? ""}
        onChange={handleAthleteNotesChange}
        onBlur={saveAthleteNotes}
        label="Your Notes"
        icon="✏️"
        placeholder="How did it feel?"
        enableTemplates={false}
      />
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 560, margin: "0 auto", padding: "0 16px 40px", display: "flex", flexDirection: "column", gap: 16 },
  backLink: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 13, cursor: "pointer", padding: "12px 0", alignSelf: "flex-start" },
  header: { display: "flex", flexDirection: "column", gap: 4 },
  categoryBadge: {
    alignSelf: "flex-start", fontSize: 11, fontWeight: 700, color: RECOVERY_COLOR, background: "#123832",
    borderRadius: 6, padding: "3px 9px", textTransform: "uppercase" as const, letterSpacing: "0.03em",
  },
  sessionName: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 700, color: "var(--text)", marginTop: 4 },
  sessionMeta: { fontSize: 13, color: "var(--mute)" },
  instructionsBox: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px", fontSize: 14, color: "var(--text)", lineHeight: 1.5 },
  metaRow: { display: "flex", gap: 8, flexWrap: "wrap" as const },
  metaChip: { fontSize: 12, color: "var(--mute)", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px" },
  mediaLink: { fontSize: 13, color: RECOVERY_COLOR, fontWeight: 600, textDecoration: "none" },
  completeBtn: {
    background: "var(--panel)", border: `1px solid ${RECOVERY_COLOR}`, color: RECOVERY_COLOR, borderRadius: 10,
    padding: "13px 0", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%",
  },
  completeBtnDone: { background: "#123832" },
  notBuilt: { fontSize: 13, color: "var(--mute)", fontStyle: "italic" },
  error: { fontSize: 13, color: "#FF6B6B" },
};

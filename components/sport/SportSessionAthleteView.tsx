"use client";

import { useState } from "react";
import SessionRPEBlock from "@/components/SessionRPEBlock";
import SessionNotesBlock from "@/components/SessionNotesBlock";
import { saveWithRetry } from "@/lib/save-queue";
import { useSessionCheckIn, lockedContentStyle } from "@/lib/use-session-checkin";
import type { Session } from "@/types";

// Athlete-side view for a Sport / Other session (0088). Shows the coach's plan
// (if any), then the athlete confirms how long it actually took, how hard it
// felt, and an optional note. Numeric input saves on blur (CLAUDE.md rule);
// RPE saves on tap via the shared block.

export default function SportSessionAthleteView({
  session: initialSession,
  token,
  onUpdated,
  onBack,
  lockUntilCheckin,
  checkedInToday,
  wellnessCheckIn,
  painCheckIn,
}: {
  session: Session;
  token: string;
  onUpdated: () => void;
  onBack: () => void;
  // Check-in was never wired up here at all - reported live, same gap
  // as Power/Speed (0111). A self-logged ("athlete_logged") Sport
  // session was never lockable anyway (session_source !== "programme"),
  // so this only actually locks a coach-programmed one.
  lockUntilCheckin?: boolean;
  checkedInToday?: boolean;
  wellnessCheckIn?: boolean;
  painCheckIn?: boolean;
}) {
  const [session, setSession] = useState(initialSession);
  const [error, setError] = useState("");
  const planned = session.sport_config?.planned ?? null;
  const { locked, checkInButton, checkInModal, lockOverlay } = useSessionCheckIn({
    session, token, lockUntilCheckin, checkedInToday, wellnessCheckIn, painCheckIn,
  });

  const [duration, setDuration] = useState(session.duration_min != null ? String(session.duration_min) : "");
  const [notes, setNotes] = useState(session.athlete_notes ?? "");

  const saveDuration = async () => {
    const n = duration === "" ? null : Math.round(parseFloat(duration));
    const clean = n != null && Number.isFinite(n) ? n : null;
    setSession((prev) => ({ ...prev, duration_min: clean }));
    const result = await saveWithRetry(`duration:${session.id}`, "/api/athlete-link/session-duration", {
      token,
      sessionId: session.id,
      durationMin: clean,
    });
    if (result.ok) { setError(""); onUpdated(); }
    else if (!result.queued) setError(result.error);
  };

  const handleRPESave = async (rpe: number) => {
    setSession((prev) => ({ ...prev, rpe, rpe_logged_at: new Date().toISOString() }));
    const result = await saveWithRetry(`rpe:${session.id}`, "/api/athlete-link/rpe", {
      token,
      sessionId: session.id,
      rpe,
    });
    if (result.ok) { setError(""); onUpdated(); }
    else if (!result.queued) { setError(result.error); throw new Error(result.error); }
  };

  const saveNotes = async () => {
    setSession((prev) => ({ ...prev, athlete_notes: notes }));
    const result = await saveWithRetry(`notes:${session.id}`, "/api/athlete-link/session-notes", {
      token,
      sessionId: session.id,
      notes,
    });
    if (result.ok) setError("");
    else if (!result.queued) setError(result.error);
  };

  return (
    <div style={s.page}>
      <button style={s.backLink} onClick={onBack}>← Back to sessions</button>

      <div style={s.headerRow}>
        <div style={s.header}>
          <div style={s.badge}>Sport / Other</div>
          <div style={s.name}>{session.name}</div>
          <div style={s.meta}>{session.date}</div>
        </div>
        {checkInButton}
      </div>

      {/* Was a plain always-expanded div with no hide/unhide control,
          unlike every other session type's athlete view - fixed for
          consistency after the same gap was reported live for
          Power/Speed (0109). Sport sessions don't have a Warm-up/
          Cool-down split (out of scope, per an earlier deliberate
          decision), just the one general note. */}
      <SessionNotesBlock value={session.session_notes ?? ""} onChange={() => {}} readOnly />

      {planned && (planned.duration_min != null || planned.rpe != null) && (
        <div style={s.planRow}>
          <span style={s.planLabel}>Planned:</span>
          {planned.duration_min != null && <span style={s.planChip}>⏱ {planned.duration_min} min</span>}
          {planned.rpe != null && <span style={s.planChip}>🔥 RPE {planned.rpe}/10</span>}
        </div>
      )}

      {error && <div style={s.error}>{error}</div>}

      <div style={{ position: "relative" as const }}>
        <div style={locked ? lockedContentStyle : undefined}>
          <div style={s.card}>
            <label style={s.label}>How long did it actually take? (minutes)</label>
            <input
              style={s.input}
              type="number"
              inputMode="numeric"
              value={duration}
              placeholder={planned?.duration_min != null ? String(planned.duration_min) : "e.g. 60"}
              onChange={(e) => setDuration(e.target.value)}
              onBlur={saveDuration}
            />
          </div>

          <SessionRPEBlock value={session.rpe ?? null} onSave={handleRPESave} />

          <div style={s.card}>
            <label style={s.label}>Anything to note? (optional)</label>
            <textarea
              style={s.textarea}
              rows={3}
              value={notes}
              placeholder="How it went, any niggles, anything your coach should know…"
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
            />
          </div>
        </div>
        {lockOverlay}
      </div>
      {checkInModal}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: "8px 0 40px" },
  backLink: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 13, cursor: "pointer", padding: "6px 0", marginBottom: 8 },
  headerRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 14 },
  header: {},
  badge: { display: "inline-block", background: "#F59E0B22", color: "#F59E0B", borderRadius: 5, padding: "3px 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 },
  name: { fontSize: 20, fontWeight: 700, color: "var(--text)" },
  meta: { fontSize: 12, color: "var(--mute)", marginTop: 2 },
  planRow: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 },
  planLabel: { fontSize: 12, color: "var(--mute)", fontWeight: 700 },
  planChip: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 6, padding: "4px 10px", fontSize: 12, color: "var(--text)" },
  error: { fontSize: 13, color: "#FF6B6B", marginBottom: 10 },
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", marginBottom: 12 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "var(--mute)", marginBottom: 6 },
  input: { width: 140, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "10px 12px", fontSize: 15 },
  textarea: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "10px 12px", fontSize: 14, resize: "vertical" },
};

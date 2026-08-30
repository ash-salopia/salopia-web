"use client";

// Athlete-facing Hyrox/Cardio session view - previously these session
// types had no athlete logging at all (the athlete app fell through
// to the generic strength set-logger, which has nothing to show since
// hyrox/cardio store their prescription in hyrox_config/cardio_config,
// not session_exercises). Page chrome + save-queue integration here;
// the actual structure display + metric boxes live in HyroxCardioLog,
// shared with Live Group's inline squad view.

import { useState } from "react";
import { saveWithRetry } from "@/lib/save-queue";
import HyroxCardioLog, { HYROX_LABEL, CARDIO_LABEL } from "@/components/HyroxCardioLog";
import { HyroxTimer } from "@/components/HyroxCardioBuilder";
import SessionRPEBlock from "@/components/SessionRPEBlock";
import SessionNotesBlock from "@/components/SessionNotesBlock";
import type { Session } from "@/types";
import type { ComputedZone } from "@/lib/training-zones";

export default function HyroxCardioAthleteView({
  session: initialSession,
  token,
  zones,
  onUpdated,
  onBack,
}: {
  session: Session;
  token: string;
  zones?: ComputedZone[] | null;
  onUpdated: () => void;
  onBack: () => void;
}) {
  const [session, setSession] = useState(initialSession);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isHyrox = session.type === "hyrox";
  const subType = isHyrox ? (session.hyrox_type ?? "") : ((session as any).cardio_type ?? "");
  const cfg: any = (isHyrox ? session.hyrox_config : (session as any).cardio_config) ?? {};
  const color = isHyrox ? "#B388FF" : "#4DC3FF";

  const handleRPESave = async (rpe: number) => {
    setSession((prev) => ({ ...prev, rpe, rpe_logged_at: new Date().toISOString() } as Session));
    const result = await saveWithRetry(`rpe:${session.id}`, "/api/athlete-link/rpe", {
      token, sessionId: session.id, rpe,
    });
    if (result.ok) {
      setError("");
    } else if (!result.queued) {
      setError(result.error);
      throw new Error(result.error);
    }
  };

  const handleAthleteNotesChange = (athlete_notes: string) => {
    setSession((prev) => ({ ...prev, athlete_notes } as Session));
  };
  // Fires once, when the athlete leaves the notes field, rather than on
  // every keystroke - same reasoning as AthleteSessionView's
  // saveAthleteNotes (a save fired per keystroke can race on a patchy
  // gym connection and leave a truncated note).
  const saveAthleteNotes = async () => {
    const result = await saveWithRetry(`notes:${session.id}`, "/api/athlete-link/session-notes", {
      token, sessionId: session.id, notes: session.athlete_notes ?? "",
    });
    if (result.ok) setError("");
    else if (!result.queued) setError(result.error);
  };

  // hyrox_config/cardio_config round-trip whole, same convention as
  // recovery_config - merge client-side, PATCH the full object.
  const patchConfig = async (patch: object) => {
    const next = { ...cfg, ...patch };
    if (isHyrox) setSession((prev) => ({ ...prev, hyrox_config: next }));
    else setSession((prev) => ({ ...prev, cardio_config: next } as any));
    setSaving(true);
    const endpoint = isHyrox ? "/api/athlete-link/hyrox-update" : "/api/athlete-link/cardio-update";
    const body = isHyrox
      ? { token, sessionId: session.id, hyroxConfig: next }
      : { token, sessionId: session.id, cardioConfig: next };
    const result = await saveWithRetry(`${session.type}:${session.id}`, endpoint, body);
    setSaving(false);
    if (!result.ok && !result.queued) setError(result.error);
    onUpdated();
  };

  return (
    <div style={styles.page}>
      <button style={styles.backLink} onClick={onBack}>← Back to sessions</button>
      <div style={styles.header}>
        <div style={styles.title}>{session.name}</div>
        <div style={styles.typeTag}>{isHyrox ? (HYROX_LABEL[subType] ?? "Hybrid") : (CARDIO_LABEL[subType] ?? "Cardio")}</div>
      </div>
      {error && <div style={styles.errorBox}>{error}</div>}
      {saving && <div style={styles.savingNote}>Saving…</div>}
      <SessionNotesBlock value={session.session_notes ?? ""} onChange={() => {}} readOnly />
      {subType && <HyroxTimer session={session} color={color} />}
      <HyroxCardioLog session={session} onPatch={patchConfig} zones={zones} />
      <SessionRPEBlock value={session.rpe ?? null} onSave={handleRPESave} />
      <SessionNotesBlock
        value={session.athlete_notes ?? ""}
        onChange={handleAthleteNotesChange}
        onBlur={saveAthleteNotes}
        label="Your Notes"
        icon="📝"
        placeholder="How did the session feel? Anything to flag for your coach…"
        enableTemplates={false}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 560, margin: "0 auto" },
  backLink: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 16 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap" as const, gap: 8 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: "var(--text)" },
  typeTag: { fontSize: 11, fontWeight: 700, color: "var(--accent)", background: "var(--accent-dim)", borderRadius: 6, padding: "3px 9px" },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12 },
  savingNote: { fontSize: 12, color: "var(--mute)", marginBottom: 8 },
};

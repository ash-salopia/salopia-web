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
import type { Session } from "@/types";

export default function HyroxCardioAthleteView({
  session: initialSession,
  token,
  onUpdated,
  onBack,
}: {
  session: Session;
  token: string;
  onUpdated: () => void;
  onBack: () => void;
}) {
  const [session, setSession] = useState(initialSession);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isHyrox = session.type === "hyrox";
  const subType = isHyrox ? (session.hyrox_type ?? "") : ((session as any).cardio_type ?? "");
  const cfg: any = (isHyrox ? session.hyrox_config : (session as any).cardio_config) ?? {};

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
        <div style={styles.typeTag}>{isHyrox ? (HYROX_LABEL[subType] ?? "Hyrox") : (CARDIO_LABEL[subType] ?? "Cardio")}</div>
      </div>
      {error && <div style={styles.errorBox}>{error}</div>}
      {saving && <div style={styles.savingNote}>Saving…</div>}
      <HyroxCardioLog session={session} onPatch={patchConfig} />
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

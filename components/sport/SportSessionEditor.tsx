"use client";

import { useState } from "react";
import type { Session } from "@/types";

// Coach-side editor for a "Sport / Other" session (0088). One small form —
// activity label, planned duration, planned session-RPE, notes. The activity
// label is the session name; planned duration/RPE are written to both the live
// columns (so the calendar and reports see the plan before the athlete logs)
// and sport_config.planned (so the plan survives once actuals overwrite the
// live columns).

type Patch = Partial<Pick<Session, "name" | "duration_min" | "rpe" | "session_notes" | "sport_config">>;

export default function SportSessionEditor({
  session,
  onChange,
}: {
  session: Session;
  onChange: (patch: Patch) => void;
}) {
  const planned = session.sport_config?.planned ?? null;
  const [activity, setActivity] = useState(session.name === "Sport session" ? "" : session.name);
  const [duration, setDuration] = useState(
    planned?.duration_min != null ? String(planned.duration_min) : session.duration_min != null ? String(session.duration_min) : ""
  );
  const [notes, setNotes] = useState(session.session_notes ?? "");
  const plannedRpe = planned?.rpe ?? session.rpe ?? null;

  const savePlanned = (next: { duration_min?: number | null; rpe?: number | null }) => {
    const merged = {
      duration_min: next.duration_min !== undefined ? next.duration_min : planned?.duration_min ?? null,
      rpe: next.rpe !== undefined ? next.rpe : planned?.rpe ?? null,
    };
    onChange({
      sport_config: { planned: merged },
      // mirror onto the live columns only while the athlete hasn't logged yet
      ...(session.rpe_logged_at ? {} : { duration_min: merged.duration_min, rpe: merged.rpe }),
    });
  };

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <label style={s.label}>Activity</label>
        <input
          style={s.input}
          value={activity}
          placeholder="e.g. 5-a-side football, club training, match, swim…"
          onChange={(e) => setActivity(e.target.value)}
          onBlur={() => {
            const name = activity.trim() || "Sport session";
            if (name !== session.name) onChange({ name });
          }}
        />

        <label style={{ ...s.label, marginTop: 14 }}>Planned duration (minutes)</label>
        <input
          style={{ ...s.input, width: 120 }}
          type="number"
          inputMode="numeric"
          value={duration}
          placeholder="60"
          onChange={(e) => setDuration(e.target.value)}
          onBlur={() => {
            const n = duration === "" ? null : Math.round(parseFloat(duration));
            savePlanned({ duration_min: Number.isFinite(n as number) ? n : null });
          }}
        />

        <label style={{ ...s.label, marginTop: 14 }}>Planned intensity (session RPE)</label>
        <div style={s.rpeRow}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <button
              key={n}
              type="button"
              style={{ ...s.rpeBtn, ...(plannedRpe === n ? s.rpeBtnOn : {}) }}
              onClick={() => savePlanned({ rpe: plannedRpe === n ? null : n })}
            >
              {n}
            </button>
          ))}
        </div>
        <div style={s.hint}>1 = very light · 10 = maximal. The athlete confirms the actual duration and RPE when they log the session.</div>

        <label style={{ ...s.label, marginTop: 14 }}>Notes for the athlete</label>
        <textarea
          style={s.textarea}
          rows={3}
          value={notes}
          placeholder="Anything they should know — focus, restrictions, what to record…"
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => { if (notes !== (session.session_notes ?? "")) onChange({ session_notes: notes }); }}
        />
      </div>

      {session.rpe_logged_at && (
        <div style={s.loggedCard}>
          <div style={s.loggedTitle}>Athlete logged</div>
          <div style={s.loggedRow}>
            <span>Duration</span><b>{session.duration_min != null ? `${session.duration_min} min` : "—"}</b>
          </div>
          <div style={s.loggedRow}>
            <span>Session RPE</span><b>{session.rpe != null ? `${session.rpe}/10` : "—"}</b>
          </div>
          {session.athlete_notes && (
            <div style={{ marginTop: 8 }}>
              <div style={s.loggedNoteLabel}>Athlete note</div>
              <div style={s.loggedNote}>{session.athlete_notes}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 12 },
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16 },
  label: { display: "block", fontSize: 12, fontWeight: 700, color: "var(--mute)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.03em" },
  input: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "10px 12px", fontSize: 14 },
  textarea: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "10px 12px", fontSize: 14, resize: "vertical" },
  rpeRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  rpeBtn: { width: 38, height: 38, borderRadius: 8, border: "1px solid var(--line)", background: "var(--ink)", color: "var(--text)", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  rpeBtnOn: { background: "#F59E0B", borderColor: "#F59E0B", color: "#1a1206" },
  hint: { fontSize: 11.5, color: "var(--mute)", marginTop: 6, lineHeight: 1.5 },
  loggedCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16 },
  loggedTitle: { fontSize: 12, fontWeight: 700, color: "#F59E0B", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.03em" },
  loggedRow: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text)", padding: "4px 0" },
  loggedNoteLabel: { fontSize: 11, fontWeight: 700, color: "var(--mute)", marginBottom: 2 },
  loggedNote: { fontSize: 13, color: "var(--text)", lineHeight: 1.5 },
};

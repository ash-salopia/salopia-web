"use client";

// Shared check-in button/modal/lock behaviour for the athlete-link
// session views. AthleteSessionView (the strength/generic branch) has
// always had this; every other session type it delegates to
// (PowerSpeedAthleteView, HyroxCardioAthleteView, SportSessionAthleteView,
// RecoverySessionAthleteView) never received the check-in props at all,
// so check-in silently didn't exist there - reported live as "the
// check-in doesn't show up on the power/speed session" (0111).
//
// Check-in itself was always correctly once-per-day, not once-per-
// session - getTodayCheckIn (lib/data/athlete-share-link.ts) resolves
// by athlete + today's date, not by session id, and the page already
// fetched checkedInToday/lockUntilCheckin once and passed them down.
// The gap was purely that those props stopped at AthleteSessionView
// and were never forwarded into its type-specific children - so
// whichever session type an athlete happened to open first that day
// silently bypassed the "lock until check-in" gate too, not just the
// button.

import { useState } from "react";
import CheckInModal from "@/components/CheckInModal";
import { todayISO } from "@/lib/date-utils";
import type { Session } from "@/types";

export function useSessionCheckIn({
  session,
  token,
  lockUntilCheckin,
  checkedInToday: initialCheckedInToday,
  wellnessCheckIn,
  painCheckIn,
}: {
  session: Session;
  token: string;
  lockUntilCheckin?: boolean;
  checkedInToday?: boolean;
  wellnessCheckIn?: boolean;
  painCheckIn?: boolean;
}) {
  const [checkedInToday, setCheckedInToday] = useState(initialCheckedInToday ?? false);
  const [checkInOpen, setCheckInOpen] = useState(false);

  // Same rule as AthleteSessionView's strength branch - only today's
  // coach-programmed session is ever gated; past/future dates and
  // Session Library (informal, athlete-started) sessions are never locked.
  const locked = !!lockUntilCheckin
    && session.session_source === "programme"
    && session.date === todayISO()
    && !checkedInToday;

  const checkInButton = (
    <button style={s.checkInBtn} onClick={() => setCheckInOpen(true)}>
      {checkedInToday ? "✓ Checked in" : "✓ Check-in"}
    </button>
  );

  const checkInModal = checkInOpen ? (
    <CheckInModal
      onClose={() => setCheckInOpen(false)}
      token={token}
      onSubmitted={() => setCheckedInToday(true)}
      wellnessEnabled={!!wellnessCheckIn}
      painEnabled={!!painCheckIn}
    />
  ) : null;

  const lockOverlay = locked ? (
    <div style={s.lockOverlay} onClick={() => setCheckInOpen(true)}>
      <div style={s.lockCard}>
        <div style={s.lockEmoji}>🔒</div>
        <div style={s.lockTitle}>Complete your check-in to unlock today&apos;s session</div>
        <button style={s.lockBtn} onClick={() => setCheckInOpen(true)}>Check in now</button>
      </div>
    </div>
  ) : null;

  return { locked, checkedInToday, checkInButton, checkInModal, lockOverlay, setCheckInOpen };
}

// Apply to whatever wraps the actual loggable content (exercise list,
// config, etc.) alongside `lockOverlay` above, positioned relatively so
// the overlay sits on top of it.
export const lockedContentStyle: React.CSSProperties = {
  filter: "blur(3px)", opacity: 0.5, pointerEvents: "none" as const, userSelect: "none" as const,
};

const s: Record<string, React.CSSProperties> = {
  checkInBtn: { background: "var(--accent-dim)", border: "none", color: "var(--accent)", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const, flexShrink: 0 },
  lockOverlay: { position: "absolute" as const, inset: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 16, zIndex: 5 },
  lockCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 24px", textAlign: "center" as const, maxWidth: 300, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" },
  lockEmoji: { fontSize: 28, marginBottom: 8 },
  lockTitle: { fontSize: 14, fontWeight: 700, color: "var(--text)", lineHeight: 1.4, marginBottom: 14 },
  lockBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
};

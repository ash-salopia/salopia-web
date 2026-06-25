"use client";

// ============================================================
// PowerSpeedSummaryBar
// Auto-totals for a power/speed session:
//   • Total sprint metres (sum of distances × sets × reps)
//   • High-speed exposures (efforts where distance >= 20m)
//   • Plyo contacts (sum of contacts × sets)
//   • Average RPE
//   • Any pain flags
// ============================================================

import type { PSExercise } from "./PowerSpeedExerciseCard";

interface Props {
  exercises: PSExercise[];
}

function parseDistance(d: string): number {
  if (!d) return 0;
  const m = d.match(/(\d+(\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function parseReps(r: string): number {
  if (!r) return 1;
  const m = r.match(/(\d+)/);
  return m ? parseInt(m[1]) : 1;
}

export default function PowerSpeedSummaryBar({ exercises }: Props) {
  if (!exercises.length) return null;

  let totalSprintMetres = 0;
  let highSpeedExposures = 0;
  let plyoContacts = 0;
  const rpeValues: number[] = [];
  const painValues: number[] = [];

  for (const ex of exercises) {
    const dist = parseDistance(ex.distance);
    const reps = parseReps(ex.reps);
    const sets = ex.sets ?? 1;

    // Sprint metres: distance × reps × completed sets
    const completedSets = ex.log.filter(s => s.done).length || sets;
    if (dist > 0) {
      totalSprintMetres += dist * reps * completedSets;
      // High speed = efforts at 20m+ (commonly used threshold)
      if (dist >= 20) {
        highSpeedExposures += reps * completedSets;
      }
    }

    // Plyo contacts
    if (ex.quality === "plyometric" && ex.contacts) {
      plyoContacts += ex.contacts * completedSets;
    }

    // RPE and pain from log
    for (const set of ex.log) {
      if (set.done) {
        const rpe = parseFloat(set.rpe);
        if (!isNaN(rpe) && rpe > 0) rpeValues.push(rpe);
        const pain = parseFloat(set.pain);
        if (!isNaN(pain) && pain > 0) painValues.push(pain);
      }
    }
  }

  const avgRpe = rpeValues.length ? (rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length).toFixed(1) : null;
  const maxPain = painValues.length ? Math.max(...painValues) : null;

  const stats = [
    { label: "Sprint metres", value: totalSprintMetres > 0 ? `${Math.round(totalSprintMetres)}m` : "—", color: "#F59E0B" },
    { label: "High-speed efforts", value: highSpeedExposures > 0 ? String(highSpeedExposures) : "—", color: "#EF4444" },
    { label: "Plyo contacts", value: plyoContacts > 0 ? String(plyoContacts) : "—", color: "#8B5CF6" },
    { label: "Avg RPE", value: avgRpe ?? "—", color: avgRpe && parseFloat(avgRpe) >= 8 ? "#EF4444" : "#10B981" },
    {
      label: "Max pain",
      value: maxPain !== null ? `${maxPain}/10` : "—",
      color: maxPain !== null && maxPain >= 5 ? "#EF4444" : maxPain !== null && maxPain >= 3 ? "#F59E0B" : "#10B981"
    },
  ];

  return (
    <div style={s.wrap}>
      <div style={s.title}>📊 Session totals</div>
      <div style={s.grid}>
        {stats.map(stat => (
          <div key={stat.label} style={s.stat}>
            <div style={s.statLabel}>{stat.label}</div>
            <div style={{ ...s.statValue, color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginBottom: 12 },
  title: { fontSize: 12, fontWeight: 700, color: "var(--mute)", marginBottom: 10, textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  grid: { display: "flex", gap: 8, flexWrap: "wrap" as const },
  stat: { flex: 1, minWidth: 80, background: "var(--ink)", borderRadius: 8, padding: "8px 10px" },
  statLabel: { fontSize: 10, color: "var(--mute)", fontWeight: 600, textTransform: "uppercase" as const, marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: 700 },
};

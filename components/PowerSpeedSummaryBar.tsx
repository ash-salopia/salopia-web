"use client";

import type { PSExercise } from "./PowerSpeedExerciseCard";

interface Props { exercises: PSExercise[]; }

function parseDistance(d: string): number {
  if (!d) return 0;
  const m = d.match(/(\d+(\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

export default function PowerSpeedSummaryBar({ exercises }: Props) {
  if (!exercises.length) return null;

  let sprintMetres = 0;
  let highSpeedEfforts = 0;
  let plyoContacts = 0;
  const rpeValues: number[] = [];
  const painValues: number[] = [];

  for (const ex of exercises) {
    const dist = parseDistance(ex.distance);
    const doneSets = ex.log.filter(s => s.done).length || ex.sets;

    if (dist > 0) {
      sprintMetres += dist * ex.reps * doneSets;
      if (dist >= 20) highSpeedEfforts += ex.reps * doneSets;
    }

    if (ex.quality === "plyometric" && ex.contacts) {
      plyoContacts += ex.contacts * doneSets;
    }

    for (const set of ex.log) {
      if (!set.done) continue;
      const rpe = parseFloat(set.rpe);
      if (!isNaN(rpe) && rpe > 0) rpeValues.push(rpe);
      const pain = parseFloat(set.pain);
      if (!isNaN(pain) && pain > 0) painValues.push(pain);
    }
  }

  const avgRpe = rpeValues.length
    ? (rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length).toFixed(1)
    : null;
  const maxPain = painValues.length ? Math.max(...painValues) : null;

  const stats = [
    { label: "Sprint metres", value: sprintMetres > 0 ? `${Math.round(sprintMetres)}m` : "—", color: "#F59E0B" },
    { label: "High-speed efforts", value: highSpeedEfforts > 0 ? String(highSpeedEfforts) : "—", color: "#EF4444" },
    { label: "Plyo contacts", value: plyoContacts > 0 ? String(plyoContacts) : "—", color: "#8B5CF6" },
    { label: "Avg RPE", value: avgRpe ?? "—", color: avgRpe && parseFloat(avgRpe) >= 8 ? "#EF4444" : "#10B981" },
    { label: "Max pain", value: maxPain !== null ? `${maxPain}/10` : "—", color: maxPain !== null && maxPain >= 5 ? "#EF4444" : maxPain !== null && maxPain >= 3 ? "#F59E0B" : "#10B981" },
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

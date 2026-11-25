"use client";

// Dropdowns for a gym's weight steps (lib/load-increments.ts) - shared by
// the coach's Settings -> Gym weights and the athlete app's "My gym".

import { DUMBBELL_OPTIONS, KETTLEBELL_OPTIONS, MACHINE_OPTIONS, PLATE_OPTIONS, type LoadIncrements } from "@/lib/load-increments";

export default function GymIncrementsPicker({
  value,
  onChange,
  disabled,
}: {
  value: LoadIncrements;
  onChange: (next: LoadIncrements) => void;
  disabled?: boolean;
}) {
  const row = (label: string, control: React.ReactNode) => (
    <label style={s.row}>
      <span style={s.label}>{label}</span>
      {control}
    </label>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {row("Dumbbells", (
        <select style={s.select} disabled={disabled} value={value.dumbbell} onChange={(e) => onChange({ ...value, dumbbell: e.target.value as LoadIncrements["dumbbell"] })}>
          {DUMBBELL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}
      {row("Kettlebells", (
        <select style={s.select} disabled={disabled} value={value.kettlebell} onChange={(e) => onChange({ ...value, kettlebell: Number(e.target.value) })}>
          {KETTLEBELL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}
      {row("Smallest barbell plates", (
        <select style={s.select} disabled={disabled} value={value.plate} onChange={(e) => onChange({ ...value, plate: Number(e.target.value) })}>
          {PLATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}
      {row("Machines & cables", (
        <select style={s.select} disabled={disabled} value={value.machine} onChange={(e) => onChange({ ...value, machine: Number(e.target.value) })}>
          {MACHINE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  row: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 13, color: "var(--mute)", fontWeight: 600 },
  select: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 14, width: "100%", maxWidth: 360 },
};

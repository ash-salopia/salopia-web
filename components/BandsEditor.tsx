"use client";

// Settings -> Resistance bands: the coach's own band set, lightest to
// heaviest. Used by the exercise editor's band picker and the athlete
// app's per-set band choice for assisted / banded exercises.

import { DEFAULT_BANDS, type Band } from "@/lib/bands";

export default function BandsEditor({ bands, onChange }: { bands: Band[]; onChange: (next: Band[]) => void }) {
  const set = (i: number, patch: Partial<Band>) => onChange(bands.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= bands.length) return;
    const next = [...bands];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div style={s.card}>
      <div style={s.label}>Your bands</div>
      <div style={s.desc}>
        For assisted pull-ups, dips and other banded work: pick a band as the exercise&apos;s load and athletes log which
        band they used each set. List them lightest to heaviest, with the help (or resistance) each gives - every brand
        grades its colours differently.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {bands.map((b, i) => (
          <div key={i} style={s.row}>
            <input type="color" value={b.colour} onChange={(e) => set(i, { colour: e.target.value })} style={s.colour} aria-label={`${b.name} colour`} />
            <input value={b.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Colour name" style={{ ...s.input, flex: 1 }} aria-label="Band name" />
            <input value={b.range} onChange={(e) => set(i, { range: e.target.value })} placeholder="e.g. 10-15kg" style={{ ...s.input, width: 110 }} aria-label="Band range" />
            <button type="button" style={s.icon} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">▴</button>
            <button type="button" style={s.icon} onClick={() => move(i, 1)} disabled={i === bands.length - 1} aria-label="Move down">▾</button>
            <button type="button" style={{ ...s.icon, color: "#FF6B6B" }} onClick={() => onChange(bands.filter((_, j) => j !== i))} disabled={bands.length <= 1} aria-label="Remove band">✕</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" style={s.ghost} onClick={() => onChange([...bands, { name: "", colour: "#888888", range: "" }])}>+ Add band</button>
        <button type="button" style={s.ghost} onClick={() => onChange(DEFAULT_BANDS)}>Reset to defaults</button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 12 },
  label: { fontSize: 15, fontWeight: 700, color: "var(--text)" },
  desc: { fontSize: 13, color: "var(--mute)", lineHeight: 1.5 },
  row: { display: "flex", alignItems: "center", gap: 6 },
  colour: { width: 34, height: 34, padding: 0, border: "1px solid var(--line)", borderRadius: 8, background: "transparent", cursor: "pointer", flexShrink: 0 },
  input: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 14, minWidth: 0 },
  icon: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 7, width: 30, height: 32, cursor: "pointer", flexShrink: 0 },
  ghost: { background: "transparent", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer" },
};

"use client";

import { useState } from "react";
import { DAYS, dayOf, offsetFor, weekOf } from "@/lib/programme-builder";
import { TYPE_COLOR } from "@/components/programme/ProgrammeSessionEditor";
import type { ProgrammeSession } from "@/types";

// The programme builder grid (0132): one row per week, Mon-Sun columns.
// Click a session to edit it, tick it to select it for the bulk tools,
// drag it to another day to move it (hold Alt / Option to copy), and +
// in any day to add sessions there.

export default function WeekGrid({
  weeks,
  sessions,
  selected,
  activeId,
  onToggle,
  onSelectMany,
  onOpen,
  onAddAt,
  onDrop,
  onWeekAction,
}: {
  weeks: number;
  sessions: ProgrammeSession[];
  selected: Set<string>;
  activeId: string | null;
  onToggle: (id: string) => void;
  onSelectMany: (ids: string[], on: boolean) => void;
  onOpen: (id: string) => void;
  onAddAt: (week: number, day: number) => void;
  onDrop: (id: string, week: number, day: number, copy: boolean) => void;
  onWeekAction: (week: number, action: "copy" | "clear") => void;
}) {
  const [over, setOver] = useState<string | null>(null);
  const byCell = new Map<number, ProgrammeSession[]>();
  for (const s of sessions) {
    const list = byCell.get(s.day_offset) ?? [];
    list.push(s);
    byCell.set(s.day_offset, list);
  }
  for (const list of Array.from(byCell.values())) list.sort((a, b) => a.sort_order - b.sort_order);

  const idsWhere = (pred: (s: ProgrammeSession) => boolean) => sessions.filter(pred).map((s) => s.id);
  const allSelected = (ids: string[]) => ids.length > 0 && ids.every((id) => selected.has(id));

  return (
    <div style={g.scroller}>
      <div style={g.grid}>
        <div style={g.corner} />
        {DAYS.map((d, day) => {
          const ids = idsWhere((s) => dayOf(s.day_offset) === day);
          return (
            <button
              key={d}
              type="button"
              style={{ ...g.dayHead, ...(allSelected(ids) ? { color: "var(--accent)" } : null) }}
              title={ids.length ? `Select every ${d} session` : undefined}
              onClick={() => ids.length && onSelectMany(ids, !allSelected(ids))}
            >
              {d}
            </button>
          );
        })}

        {Array.from({ length: weeks }, (_, week) => {
          const weekIds = idsWhere((s) => weekOf(s.day_offset) === week);
          return [
            <div key={`w${week}`} style={g.weekHead}>
              <label style={g.weekLabel}>
                <input
                  type="checkbox"
                  style={g.check}
                  checked={allSelected(weekIds)}
                  disabled={!weekIds.length}
                  onChange={(e) => onSelectMany(weekIds, e.target.checked)}
                  aria-label={`Select week ${week + 1}`}
                />
                W{week + 1}
              </label>
              {weekIds.length > 0 && (
                <div style={{ display: "flex", gap: 2 }}>
                  <button type="button" style={g.weekBtn} title="Copy this week to other weeks" onClick={() => onWeekAction(week, "copy")}>⧉</button>
                  <button type="button" style={g.weekBtn} title="Clear this week" onClick={() => onWeekAction(week, "clear")}>✕</button>
                </div>
              )}
            </div>,
            ...DAYS.map((_, day) => {
              const off = offsetFor(week, day);
              const cellKey = `${week}-${day}`;
              const list = byCell.get(off) ?? [];
              return (
                <div
                  key={cellKey}
                  style={{ ...g.cell, ...(over === cellKey ? g.cellOver : null) }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = e.altKey ? "copy" : "move";
                    if (over !== cellKey) setOver(cellKey);
                  }}
                  onDragLeave={() => setOver((o) => (o === cellKey ? null : o))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(null);
                    const id = e.dataTransfer.getData("text/plain");
                    if (id) onDrop(id, week, day, e.altKey);
                  }}
                >
                  {list.map((s) => (
                    <div
                      key={s.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", s.id);
                        e.dataTransfer.effectAllowed = "copyMove";
                      }}
                      onClick={() => onOpen(s.id)}
                      style={{
                        ...g.chip,
                        borderLeftColor: TYPE_COLOR[s.type] ?? "#888",
                        ...(selected.has(s.id) ? g.chipSelected : null),
                        ...(activeId === s.id ? g.chipActive : null),
                      }}
                      title={`${s.name} - click to edit, drag to move (Alt/Option-drag to copy)`}
                    >
                      <input
                        type="checkbox"
                        style={g.check}
                        checked={selected.has(s.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => onToggle(s.id)}
                        aria-label={`Select ${s.name}`}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={g.chipName}>{s.name || "Session"}</div>
                        {(s.exercises?.length ?? 0) > 0 && <div style={g.chipMeta}>{s.exercises.length} ex</div>}
                      </div>
                    </div>
                  ))}
                  <button type="button" style={g.add} onClick={() => onAddAt(week, day)} aria-label={`Add to ${DAYS[day]} week ${week + 1}`}>
                    +
                  </button>
                </div>
              );
            }),
          ];
        })}
      </div>
    </div>
  );
}

const g: Record<string, React.CSSProperties> = {
  scroller: { overflowX: "auto", paddingBottom: 4 },
  grid: { display: "grid", gridTemplateColumns: "64px repeat(7, minmax(108px, 1fr))", gap: 4, minWidth: 820 },
  corner: {},
  dayHead: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", padding: "4px 0", cursor: "pointer" },
  weekHead: { display: "flex", flexDirection: "column", justifyContent: "center", gap: 4, padding: "4px 2px" },
  weekLabel: { display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 800, color: "var(--text)", cursor: "pointer" },
  weekBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 5, fontSize: 11, padding: "1px 5px", cursor: "pointer" },
  cell: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: 4, minHeight: 64, display: "flex", flexDirection: "column", gap: 3 },
  cellOver: { borderColor: "var(--accent)", background: "var(--accent-dim)" },
  chip: { display: "flex", alignItems: "flex-start", gap: 4, background: "var(--panel)", border: "1px solid var(--line)", borderLeft: "3px solid", borderRadius: 6, padding: "4px 5px", cursor: "pointer", userSelect: "none" },
  chipSelected: { background: "var(--accent-dim)", borderColor: "var(--accent)" },
  chipActive: { boxShadow: "0 0 0 2px var(--accent)" },
  chipName: { fontSize: 11.5, fontWeight: 700, color: "var(--text)", lineHeight: 1.25, wordBreak: "break-word" },
  chipMeta: { fontSize: 10, color: "var(--mute)" },
  check: { width: 13, height: 13, accentColor: "var(--accent)", cursor: "pointer", margin: "1px 0 0", flexShrink: 0 },
  add: { marginTop: "auto", background: "transparent", border: "1px dashed var(--line)", color: "var(--mute)", borderRadius: 6, fontSize: 13, lineHeight: 1, padding: "3px 0", cursor: "pointer" },
};

"use client";

// Visual summary blocks for the Training Report (ReportModal): headline
// cards, PB wall, progress bars, per-exercise trend charts, consistency
// calendar and weekly sessions chart. Everything is inline styles + SVG
// built on the theme CSS variables, because Print clones the report's
// DOM into a blank window that redefines those variables for paper
// (light background) - anything not inline wouldn't survive the trip.

import { useState } from "react";
import { groupPBs, pbValueText } from "@/lib/report-visuals";
import type {
  AdherenceRow,
  BenchmarkGroup,
  CalendarDay,
  GoalProgress,
  Headline,
  HrZoneSplit,
  ReadinessSummary,
  ReportPB,
  UpcomingCompetition,
  VisualSessionType,
  WeeklySessions,
} from "@/lib/report-visuals";

export const GOOD = "#1baf7a";
export const BAD = "#e5484d";
export const WARN = "#F59E0B";

export const TYPE_COLOUR: Record<VisualSessionType, string> = {
  strength: "#3B82F6",
  power_speed: "#A855F7",
  cardio: "#F59E0B",
  hyrox: "#10B981",
  other: "#64748B",
};
export const TYPE_LABEL: Record<VisualSessionType, string> = {
  strength: "Strength",
  power_speed: "Power/Speed",
  cardio: "Cardio",
  hyrox: "Hybrid",
  other: "Other",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]}`;
}
function fmtPct(p: number): string {
  return `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
}

// ── Headline cards ───────────────────────────────────────────────────────────

function Delta({ now, before, unit = "", neutral = false, decimals = 0 }: { now: number | null; before: number | null; unit?: string; neutral?: boolean; decimals?: number }) {
  if (now == null || before == null) return null;
  const diff = Math.round((now - before) * 10 ** decimals) / 10 ** decimals;
  if (diff === 0) return <div style={v.delta}>Same as prev.</div>;
  const up = diff > 0;
  const colour = neutral ? "var(--mute)" : up ? GOOD : BAD;
  return (
    <div style={{ ...v.delta, color: colour }}>
      {up ? "▲" : "▼"} {Math.abs(diff).toFixed(decimals)}
      {unit} vs prev.
    </div>
  );
}

export function HeadlineCards({ headline, previous, previousLabel }: { headline: Headline; previous: Headline | null; previousLabel?: string | null }) {
  const h = headline;
  const p = previous;
  const tonnes = h.totalTonnageKg / 1000;
  const cards: { label: string; value: string; sub?: React.ReactNode; extra?: React.ReactNode; delta?: React.ReactNode }[] = [
    {
      label: "Sessions done",
      value: String(h.sessionsCompleted),
      sub: h.sessionsAssigned ? `${h.sessionsAssigned} assigned` : "None assigned",
      delta: <Delta now={h.sessionsCompleted} before={p?.sessionsCompleted ?? null} />,
    },
    {
      label: "Completion",
      value: h.completionPct == null ? "-" : `${h.completionPct}%`,
      extra:
        h.completionPct == null ? null : (
          <div style={v.meter}>
            <div style={{ ...v.meterFill, width: `${h.completionPct}%`, background: h.completionPct >= 80 ? GOOD : h.completionPct >= 60 ? WARN : BAD }} />
          </div>
        ),
      delta: <Delta now={h.completionPct} before={p?.completionPct ?? null} unit="%" />,
    },
    {
      label: "PBs",
      value: `${h.pbCount}`,
      sub: h.pbCount ? `personal best${h.pbCount === 1 ? "" : "s"}` : "None this period",
      delta: <Delta now={h.pbCount} before={p?.pbCount ?? null} />,
    },
    {
      label: "Avg RPE",
      value: h.avgRpe == null ? "-" : `${h.avgRpe}`,
      extra:
        h.avgRpe == null ? null : (
          <div style={{ display: "flex", gap: 2, marginTop: 6 }}>
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} style={{ flex: 1, height: 6, borderRadius: 2, background: i < Math.round(h.avgRpe!) ? (i >= 8 ? BAD : i >= 6 ? WARN : GOOD) : "var(--line)" }} />
            ))}
          </div>
        ),
      delta: <Delta now={h.avgRpe} before={p?.avgRpe ?? null} neutral decimals={1} />,
    },
    {
      label: "Total lifted",
      value: tonnes >= 10 ? `${tonnes.toFixed(0)} t` : tonnes >= 1 ? `${tonnes.toFixed(1)} t` : `${h.totalTonnageKg} kg`,
      sub: "Strength tonnage",
      delta:
        p && p.totalTonnageKg > 0 ? (
          <div style={{ ...v.delta, color: h.totalTonnageKg >= p.totalTonnageKg ? GOOD : BAD }}>
            {h.totalTonnageKg >= p.totalTonnageKg ? "▲" : "▼"} {Math.abs(Math.round(((h.totalTonnageKg - p.totalTonnageKg) / p.totalTonnageKg) * 100))}% vs prev.
          </div>
        ) : null,
    },
  ];
  return (
    <>
      <div style={v.cardGrid}>
        {cards.map((c) => (
          <div key={c.label} style={v.card}>
            <div style={v.cardLabel}>{c.label}</div>
            <div style={v.cardValue}>{c.value}</div>
            {c.sub && <div style={v.cardSub}>{c.sub}</div>}
            {c.extra}
            {c.delta}
          </div>
        ))}
      </div>
      {previous && previousLabel && <div style={v.more}>&ldquo;Prev.&rdquo; = the {previousLabel}.</div>}
    </>
  );
}

// ── PB wall ──────────────────────────────────────────────────────────────────

const GOLD = "#C9A227";

function MedalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="15" r="6" style={{ fill: "none", stroke: GOLD, strokeWidth: 2.2 }} />
      <path d="M8 2l3 6M16 2l-3 6" style={{ stroke: GOLD, strokeWidth: 2.2, strokeLinecap: "round" }} />
      <path d="M12 12.2l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z" style={{ fill: GOLD }} />
    </svg>
  );
}

// Red ✕ that takes one exercise out of the whole report (see
// lib/report-hide.ts). Never printed.
export function HideExerciseBtn({ name, onHide }: { name: string; onHide?: (name: string) => void }) {
  if (!onHide) return null;
  return (
    <button
      type="button"
      data-no-print="true"
      title={`Remove ${name} from this report`}
      aria-label={`Remove ${name} from this report`}
      onClick={() => onHide(name)}
      style={v.hideBtn}
    >
      ✕
    </button>
  );
}

export function PBWall({ pbs, max = 12, onHide }: { pbs: ReportPB[]; max?: number; onHide?: (name: string) => void }) {
  const cards = groupPBs(pbs);
  const shown = cards.slice(0, max);
  return (
    <>
      <div style={v.pbGrid}>
        {shown.map(({ pb, count }, i) => (
          <div key={`${pb.exercise}-${pb.kind}-${i}`} style={v.pbCard}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "flex-start" }}>
              <div style={v.pbExercise}>{pb.exercise}</div>
              <HideExerciseBtn name={pb.exercise} onHide={onHide} />
            </div>
            <div style={v.pbValue}>{pbValueText(pb)}</div>
            <div style={v.pbMeta}>
              <MedalIcon />
              <span>{shortDate(pb.date)}</span>
              {count > 1 && <span style={{ color: "var(--mute)" }}>· {count} PBs this period</span>}
            </div>
          </div>
        ))}
      </div>
      {cards.length > max && <div style={v.more}>+ {cards.length - max} more exercise{cards.length - max === 1 ? "" : "s"} with PBs in this period</div>}
    </>
  );
}

// ── Progress bars ────────────────────────────────────────────────────────────

export interface ProgressRow {
  name: string;
  pct: number;
  first: number;
  latest: number;
}

export function ProgressBars({ rows, unit, decimals = 0, onHide }: { rows: ProgressRow[]; unit: string; decimals?: number; onHide?: (name: string) => void }) {
  const sorted = [...rows].sort((a, b) => b.pct - a.pct);
  const maxAbs = Math.max(5, ...sorted.map((r) => Math.abs(r.pct)));
  const hasNeg = sorted.some((r) => r.pct < 0);
  // Zero line sits at the left when nothing went backwards, so a
  // positive-only chart uses the full width.
  const zero = hasNeg ? 40 : 0;
  const posSpan = 100 - zero;
  const reviewFrom = sorted.length >= 6 ? sorted.length - 3 : Infinity;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {sorted.map((r, i) => {
        const w = (Math.abs(r.pct) / maxAbs) * (r.pct >= 0 ? posSpan : zero);
        const colour = r.pct > 0 ? GOOD : r.pct < 0 ? BAD : "var(--mute)";
        const slow = i >= reviewFrom;
        return (
          <div key={r.name} style={v.barRow}>
            <div style={v.barTop}>
              <div style={v.barName}>
                <span style={{ minWidth: 0 }}>{r.name}</span>
                <HideExerciseBtn name={r.name} onHide={onHide} />
                {i < 3 && r.pct > 0 && <span style={{ ...v.tag, color: GOOD, borderColor: GOOD }}>Top</span>}
                {slow && (
                  <span style={{ ...v.tag, color: WARN, borderColor: WARN }}>{r.pct > 0 ? "Slowest" : "Review"}</span>
                )}
              </div>
              <div style={v.barNums}>
                <span style={v.barRange}>
                  {r.first.toFixed(decimals)} → {r.latest.toFixed(decimals)}
                  {unit}
                </span>
                <span style={{ ...v.barPct, color: colour }}>{fmtPct(r.pct)}</span>
              </div>
            </div>
            <div style={v.barTrack}>
              {hasNeg && <div style={{ ...v.zeroLine, left: `${zero}%` }} />}
              <div
                style={{
                  position: "absolute",
                  top: 2,
                  bottom: 2,
                  borderRadius: 4,
                  background: colour,
                  left: r.pct >= 0 ? `${zero}%` : `${zero - w}%`,
                  width: `${Math.max(w, 0.8)}%`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Per-exercise trend charts (small multiples) ──────────────────────────────

export interface TrendSeries {
  name: string;
  points: { date: string; value: number }[];
  pct: number | null;
}

function MiniChart({ points, colour }: { points: { date: string; value: number }[]; colour: string }) {
  const W = 220;
  const H = 64;
  const pad = 4;
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (max === min) {
    max += 1;
    min -= 1;
  }
  const x = (i: number) => (points.length === 1 ? W / 2 : pad + (i / (points.length - 1)) * (W - pad * 2));
  const y = (val: number) => pad + (1 - (val - min) / (max - min)) * (H - pad * 2);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }}>
      <path d={area} style={{ fill: colour, opacity: 0.15 }} />
      <path d={line} style={{ fill: "none", stroke: colour, strokeWidth: 2 }} vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r={i === points.length - 1 ? 3 : 1.6} style={{ fill: colour }} />
      ))}
    </svg>
  );
}

export function SmallMultiples({ series, unit, decimals = 0, onHide }: { series: TrendSeries[]; unit: string; decimals?: number; onHide?: (name: string) => void }) {
  return (
    <div style={v.smGrid}>
      {series.map((s) => {
        const vals = s.points.map((p) => p.value);
        const latest = vals[vals.length - 1];
        const colour = s.pct == null || s.pct === 0 ? "var(--accent)" : s.pct > 0 ? GOOD : BAD;
        return (
          <div key={s.name} style={v.smCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
              <div style={v.smName}>{s.name}</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {s.pct != null && <div style={{ fontSize: 12, fontWeight: 700, color: colour, whiteSpace: "nowrap" }}>{fmtPct(s.pct)}</div>}
                <HideExerciseBtn name={s.name} onHide={onHide} />
              </div>
            </div>
            <div style={v.smValue}>
              {latest.toFixed(decimals)}
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--mute)" }}> {unit}</span>
            </div>
            <MiniChart points={s.points} colour={colour} />
            <div style={v.smAxis}>
              <span>{shortDate(s.points[0].date)}</span>
              <span>
                {Math.min(...vals).toFixed(decimals)}–{Math.max(...vals).toFixed(decimals)}
                {unit}
              </span>
              <span>{shortDate(s.points[s.points.length - 1].date)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Consistency calendar ─────────────────────────────────────────────────────

const STATUS_STYLE: Record<CalendarDay["status"], { background: string; border?: string; label: string }> = {
  done: { background: GOOD, label: "Done" },
  partial: { background: WARN, label: "Partly done" },
  missed: { background: BAD, label: "Missed" },
  upcoming: { background: "transparent", border: "1px dashed var(--mute)", label: "Upcoming" },
  rest: { background: "var(--panel2)", label: "No session" },
};

export function ConsistencyCalendar({ days }: { days: CalendarDay[] }) {
  if (!days.length) return null;
  // Columns are weeks (Mon-Sun down each column), GitHub-style. Pad the
  // first column so day 1 sits on its real weekday.
  const firstDow = (new Date(days[0].date + "T12:00:00Z").getUTCDay() + 6) % 7;
  const cells: (CalendarDay | null)[] = [...Array(firstDow).fill(null), ...days];
  const weeks: (CalendarDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const counts = { done: 0, partial: 0, missed: 0 };
  for (const d of days) if (d.status in counts) counts[d.status as keyof typeof counts]++;
  const judged = counts.done + counts.partial + counts.missed;

  const CELL = 15;
  const GAP = 3;
  return (
    <div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: GAP, marginTop: 16 }}>
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <div key={i} style={{ height: CELL, fontSize: 9, color: "var(--mute)", lineHeight: `${CELL}px` }}>
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => {
          const first = week.find(Boolean);
          const showMonth = first && (wi === 0 || parseInt(first.date.slice(8)) <= 7);
          return (
            <div key={wi} style={{ display: "flex", flexDirection: "column", gap: GAP }}>
              <div style={{ height: 13, fontSize: 9, color: "var(--mute)", whiteSpace: "nowrap" }}>
                {showMonth && first ? MONTHS[parseInt(first.date.slice(5, 7)) - 1] : ""}
              </div>
              {Array.from({ length: 7 }, (_, di) => {
                const day = week[di];
                if (!day) return <div key={di} style={{ width: CELL, height: CELL }} />;
                const st = STATUS_STYLE[day.status];
                return (
                  <div
                    key={di}
                    title={`${shortDate(day.date)} · ${st.label}${day.sessions > 1 ? ` (${day.sessions} sessions)` : ""}`}
                    style={{ width: CELL, height: CELL, borderRadius: 3, background: st.background, border: st.border, boxSizing: "border-box" }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      <div style={v.legend}>
        {(["done", "partial", "missed", "rest"] as const).map((k) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: STATUS_STYLE[k].background, display: "inline-block" }} />
            {STATUS_STYLE[k].label}
            {k !== "rest" && ` (${counts[k]})`}
          </span>
        ))}
        {judged > 0 && (
          <span style={{ marginLeft: "auto", fontWeight: 700, color: "var(--text)" }}>
            {Math.round((counts.done / judged) * 100)}% of session days fully done
          </span>
        )}
      </div>
    </div>
  );
}

// ── Weekly sessions chart ────────────────────────────────────────────────────

export function WeeklySessionsChart({ weekly }: { weekly: WeeklySessions[] }) {
  if (!weekly.length) return null;
  const types: VisualSessionType[] = ["strength", "power_speed", "cardio", "hyrox", "other"];
  const present = types.filter((t) => weekly.some((w) => w.completed[t] > 0));
  const totals = weekly.map((w) => types.reduce((a, t) => a + w.completed[t], 0) + w.missed);
  const maxSessions = Math.max(1, ...totals);
  const hasRpe = weekly.some((w) => w.avgRpe != null);

  const W = 640;
  const H = 190;
  const left = 26;
  const right = hasRpe ? 26 : 8;
  const top = 10;
  const bottom = 22;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const slot = plotW / weekly.length;
  const barW = Math.min(36, slot * 0.62);
  const yS = (n: number) => top + plotH - (n / maxSessions) * plotH;
  const yR = (r: number) => top + plotH - (r / 10) * plotH;
  const labelEvery = Math.ceil(weekly.length / 10);
  const ticks = Array.from(new Set([0, Math.ceil(maxSessions / 2), maxSessions]));

  const rpePts = weekly
    .map((w, i) => (w.avgRpe == null ? null : { x: left + slot * i + slot / 2, y: yR(w.avgRpe) }))
    .filter(Boolean) as { x: number; y: number }[];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", maxWidth: W }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={yS(t)} y2={yS(t)} style={{ stroke: "var(--line)", strokeWidth: 1 }} />
            <text x={left - 6} y={yS(t) + 3} textAnchor="end" style={{ fill: "var(--mute)", fontSize: 10 }}>
              {t}
            </text>
          </g>
        ))}
        {hasRpe &&
          [0, 5, 10].map((r) => (
            <text key={r} x={W - right + 6} y={yR(r) + 3} style={{ fill: "var(--mute)", fontSize: 10 }}>
              {r}
            </text>
          ))}
        {weekly.map((w, i) => {
          const x = left + slot * i + (slot - barW) / 2;
          let acc = 0;
          return (
            <g key={w.weekStart}>
              {present.map((t) => {
                const n = w.completed[t];
                if (!n) return null;
                const y = yS(acc + n);
                const h = yS(acc) - y;
                acc += n;
                return <rect key={t} x={x} y={y} width={barW} height={h} rx={2} style={{ fill: TYPE_COLOUR[t] }} />;
              })}
              {w.missed > 0 && (
                <rect
                  x={x + 0.75}
                  y={yS(acc + w.missed) + 0.75}
                  width={barW - 1.5}
                  height={yS(acc) - yS(acc + w.missed) - 1.5}
                  rx={2}
                  style={{ fill: BAD, fillOpacity: 0.18, stroke: BAD, strokeWidth: 1.5, strokeDasharray: "3 2" }}
                />
              )}
              {i % labelEvery === 0 && (
                <text x={left + slot * i + slot / 2} y={H - 6} textAnchor="middle" style={{ fill: "var(--mute)", fontSize: 10 }}>
                  {shortDate(w.weekStart)}
                </text>
              )}
            </g>
          );
        })}
        {rpePts.length > 1 && (
          <path d={rpePts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} style={{ fill: "none", stroke: "var(--text)", strokeWidth: 1.5, opacity: 0.7 }} />
        )}
        {rpePts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} style={{ fill: "var(--text)", opacity: 0.8 }} />
        ))}
      </svg>
      <div style={v.legend}>
        {present.map((t) => (
          <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: TYPE_COLOUR[t], display: "inline-block" }} />
            {TYPE_LABEL[t]}
          </span>
        ))}
        {weekly.some((w) => w.missed > 0) && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, border: `1.5px dashed ${BAD}`, display: "inline-block", boxSizing: "border-box" }} />
            Missed
          </span>
        )}
        {hasRpe && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 14, height: 2, background: "var(--text)", opacity: 0.7, display: "inline-block" }} />
            Avg RPE (right axis)
          </span>
        )}
      </div>
    </div>
  );
}

// ── Upcoming competitions ────────────────────────────────────────────────────

export function CompetitionStrip({ competitions }: { competitions: UpcomingCompetition[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {competitions.map((c) => (
        <div key={`${c.title}-${c.date}`} style={v.compRow}>
          <div style={v.compDays}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 30, fontWeight: 700, lineHeight: 1, color: "var(--text)" }}>{c.daysAway}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {c.daysAway === 1 ? "day" : "days"} to go
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{c.title}</div>
            <div style={{ fontSize: 12, color: "var(--mute)", marginTop: 2 }}>
              {longDate(c.date)}
              {c.location ? ` · ${c.location}` : ""}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function longDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// ── Coach's verdict ──────────────────────────────────────────────────────────

export interface Verdict {
  wentWell: string;
  workOn: string;
  nextFocus: string;
}

const VERDICT_FIELDS: { key: keyof Verdict; label: string; colour: string; placeholder: string }[] = [
  { key: "wentWell", label: "What went well", colour: GOOD, placeholder: "e.g. Squat up 8kg and every session completed." },
  { key: "workOn", label: "What to work on", colour: WARN, placeholder: "e.g. Upper-body pressing has stalled." },
  { key: "nextFocus", label: "Focus for next block", colour: "var(--accent)", placeholder: "e.g. Build pressing volume ahead of the season." },
];

// Plain text on the page (so Print and Email carry it), with a pencil
// to edit each box. Empty boxes are left off the printed copy.
export function CoachVerdict({ value, onChange, loading }: { value: Verdict; onChange: (v: Verdict) => void; loading?: boolean }) {
  const [editing, setEditing] = useState<keyof Verdict | null>(null);
  return (
    <div style={v.verdictGrid}>
      {VERDICT_FIELDS.map((f) => {
        const text = value[f.key];
        const isEditing = editing === f.key;
        return (
          <div key={f.key} style={{ ...v.verdictCard, borderTop: `2px solid ${f.colour}` }} data-no-print={!text && !isEditing ? "true" : undefined}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ ...v.cardLabel, color: f.colour }}>{f.label}</div>
              {!isEditing && (
                <button data-no-print="true" style={v.editBtn} onClick={() => setEditing(f.key)} aria-label={`Edit ${f.label}`}>
                  ✎ Edit
                </button>
              )}
            </div>
            {isEditing ? (
              <textarea
                autoFocus
                value={text}
                placeholder={f.placeholder}
                rows={3}
                onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
                onBlur={() => setEditing(null)}
                style={v.verdictInput}
              />
            ) : loading && !text ? (
              <div data-no-print="true" style={{ ...v.verdictText, color: "var(--mute)" }}>Drafting…</div>
            ) : text ? (
              <div style={v.verdictText}>{text}</div>
            ) : (
              <div data-no-print="true" style={{ ...v.verdictText, color: "var(--mute)", fontStyle: "italic", cursor: "pointer" }} onClick={() => setEditing(f.key)}>
                Click to add…
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// "Ask AI to change this" under the Coach's Summary - the coach types a
// change ("drop the back squat, add something on sprint times"), the AI
// redrafts the boxes from the report data, and nothing replaces the
// boxes until the coach accepts. Capped per report so a long session of
// tweaking can't run up the AI bill (~1p an edit).
export const VERDICT_AI_EDIT_LIMIT = 10;

export function VerdictAiEdit({
  request,
  onAccept,
  used,
}: {
  request: (instruction: string) => Promise<Verdict>;
  onAccept: (v: Verdict) => void;
  used: number;
}) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Verdict | null>(null);
  const left = VERDICT_AI_EDIT_LIMIT - used;

  const run = async () => {
    if (!instruction.trim() || busy || left <= 0) return;
    setBusy(true);
    setError(null);
    try {
      setProposal(await request(instruction.trim()));
    } catch {
      setError("Couldn't redraft just now - try again, or edit the boxes by hand.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-no-print="true" style={{ marginTop: 10 }}>
      {proposal ? (
        <div style={{ border: "1px dashed var(--accent)", borderRadius: 12, padding: 10 }}>
          <div style={{ ...v.cardLabel, color: "var(--accent)", marginBottom: 8 }}>Suggested change</div>
          <div style={v.verdictGrid}>
            {VERDICT_FIELDS.map((f) => (
              <div key={f.key} style={{ ...v.verdictCard, borderTop: `2px solid ${f.colour}` }}>
                <div style={{ ...v.cardLabel, color: f.colour }}>{f.label}</div>
                <div style={v.verdictText}>{proposal[f.key] || <span style={{ color: "var(--mute)" }}>(empty)</span>}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              style={{ ...v.editBtn, background: "var(--accent)", color: "var(--ink)", borderColor: "var(--accent)", padding: "6px 12px", fontSize: 12 }}
              onClick={() => {
                onAccept(proposal);
                setProposal(null);
                setInstruction("");
              }}
            >
              Use this
            </button>
            <button style={{ ...v.editBtn, padding: "6px 12px", fontSize: 12 }} onClick={() => setProposal(null)}>
              Discard
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value.slice(0, 500))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                run();
              }
            }}
            placeholder="Ask AI to change this - e.g. remove the back squat, add more on sprint times"
            rows={2}
            disabled={busy || left <= 0}
            style={{ ...v.verdictInput, marginTop: 0, flex: "1 1 240px", borderColor: "var(--line)" }}
          />
          <button
            onClick={run}
            disabled={busy || !instruction.trim() || left <= 0}
            style={{ ...v.editBtn, padding: "8px 14px", fontSize: 12, color: "var(--text)", opacity: busy || !instruction.trim() || left <= 0 ? 0.5 : 1 }}
          >
            {busy ? "Redrafting…" : "✦ Redraft"}
          </button>
        </div>
      )}
      <div style={{ fontSize: 11, color: error ? "var(--bad, #e5484d)" : "var(--mute)", marginTop: 6 }}>
        {error ?? (left <= 0 ? `AI edit limit reached for this report - edit the boxes by hand.` : `${left} AI edit${left === 1 ? "" : "s"} left on this report.`)}
      </div>
    </div>
  );
}

// ── Goal progress ────────────────────────────────────────────────────────────

const GOAL_STATUS: Record<GoalProgress["status"], { label: string; colour: string }> = {
  achieved: { label: "Achieved", colour: GOOD },
  on_track: { label: "On track", colour: GOOD },
  behind: { label: "Behind schedule", colour: WARN },
  overdue: { label: "Past target date", colour: BAD },
  in_progress: { label: "In progress", colour: "var(--accent)" },
  no_data: { label: "Not measured yet", colour: "var(--mute)" },
};

function fmtGoalValue(n: number | null, unit: string): string {
  if (n == null) return "-";
  const s = Number.isInteger(n) ? String(n) : n.toFixed(Math.abs(n) < 10 ? 2 : 1);
  return `${s}${unit ? (unit === "kg" || unit === "%" ? unit : ` ${unit}`) : ""}`;
}

export function GoalProgressList({ goals }: { goals: GoalProgress[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {goals.map((g) => {
        const st = GOAL_STATUS[g.status];
        return (
          <div key={g.id} style={v.goalCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", minWidth: 0 }}>
                {g.label}
                {g.tier === "primary" && <span style={{ ...v.tag, color: "var(--accent)", borderColor: "var(--accent)", marginLeft: 8 }}>Main goal</span>}
              </div>
              <span style={{ ...v.statusPill, color: st.colour, borderColor: st.colour }}>{st.label}</span>
            </div>
            {g.target != null ? (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 700, color: "var(--text)" }}>{fmtGoalValue(g.current, g.unit)}</span>
                  <span style={{ fontSize: 12, color: "var(--mute)" }}>
                    of {fmtGoalValue(g.target, g.unit)}
                    {g.start != null ? ` · started at ${fmtGoalValue(g.start, g.unit)}` : ""}
                  </span>
                </div>
                <div style={v.goalTrack}>
                  <div style={{ ...v.goalFill, width: `${Math.round((g.pct ?? 0) * 100)}%`, background: st.colour }} />
                </div>
              </>
            ) : (
              g.note && <div style={{ fontSize: 13, color: "var(--text)", marginTop: 6 }}>{g.note}</div>
            )}
            {g.targetDate && (
              <div style={{ fontSize: 11, color: "var(--mute)", marginTop: 6 }}>
                Target date {longDate(g.targetDate)}
                {g.daysLeft != null && g.daysLeft >= 0 && g.status !== "achieved" ? ` · ${g.daysLeft} days left` : ""}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Readiness vs training ────────────────────────────────────────────────────

function Gauge({ label, value, invert = false }: { label: string; value: number; invert?: boolean }) {
  const good = invert ? 6 - value : value;
  const colour = good >= 3.5 ? GOOD : good >= 2.5 ? WARN : BAD;
  return (
    <div style={v.card}>
      <div style={v.cardLabel}>{label}</div>
      <div style={{ ...v.cardValue, fontSize: 28 }}>
        {value.toFixed(1)}
        <span style={{ fontSize: 13, color: "var(--mute)", fontWeight: 600 }}> /5</span>
      </div>
      <div style={v.meter}>
        <div style={{ ...v.meterFill, width: `${(value / 5) * 100}%`, background: colour }} />
      </div>
      {invert && <div style={{ ...v.cardSub, fontSize: 11 }}>Lower is better</div>}
    </div>
  );
}

export function ReadinessPanel({ readiness }: { readiness: ReadinessSummary }) {
  const r = readiness;
  const weeks = r.weekly;
  const W = 640, H = 170, left = 26, right = 26, top = 10, bottom = 22;
  const plotW = W - left - right, plotH = H - top - bottom;
  const slot = plotW / Math.max(weeks.length, 1);
  const barW = Math.min(30, slot * 0.5);
  const maxS = Math.max(1, ...weeks.map((w) => w.sessionsDone));
  const yS = (n: number) => top + plotH - (n / maxS) * plotH;
  const yR = (x: number) => top + plotH - ((x - 1) / 4) * plotH; // 1-5 scale
  const pts = weeks.map((w, i) => (w.readiness == null ? null : { x: left + slot * i + slot / 2, y: yR(w.readiness) })).filter(Boolean) as { x: number; y: number }[];
  const labelEvery = Math.ceil(weeks.length / 10);

  const lowRate = r.lowDaysWithSession ? Math.round((r.lowDaysCompleted / r.lowDaysWithSession) * 100) : null;
  const goodRate = r.goodDaysWithSession ? Math.round((r.goodDaysCompleted / r.goodDaysWithSession) * 100) : null;

  return (
    <div>
      <div style={v.cardGrid}>
        <Gauge label="Readiness" value={r.avgReadiness} />
        <Gauge label="Sleep" value={r.avgSleep} />
        <Gauge label="Energy" value={r.avgEnergy} />
        <Gauge label="Soreness" value={r.avgSoreness} invert />
      </div>
      <div style={{ ...v.more, marginTop: 6 }}>From {r.checkins} check-in{r.checkins === 1 ? "" : "s"}. Readiness combines sleep, energy and soreness.</div>
      {weeks.length > 1 && pts.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", maxWidth: W }}>
            {[1, 3, 5].map((t) => (
              <g key={t}>
                <line x1={left} x2={W - right} y1={yR(t)} y2={yR(t)} style={{ stroke: "var(--line)", strokeWidth: 1 }} />
                <text x={W - right + 6} y={yR(t) + 3} style={{ fill: "var(--mute)", fontSize: 10 }}>{t}</text>
              </g>
            ))}
            {[0, maxS].map((t) => (
              <text key={t} x={left - 6} y={yS(t) + 3} textAnchor="end" style={{ fill: "var(--mute)", fontSize: 10 }}>{t}</text>
            ))}
            {weeks.map((w, i) => (
              <g key={w.weekStart}>
                {w.sessionsDone > 0 && (
                  <rect x={left + slot * i + (slot - barW) / 2} y={yS(w.sessionsDone)} width={barW} height={yS(0) - yS(w.sessionsDone)} rx={2} style={{ fill: "var(--panel2)", stroke: "var(--line)" }} />
                )}
                {i % labelEvery === 0 && (
                  <text x={left + slot * i + slot / 2} y={H - 6} textAnchor="middle" style={{ fill: "var(--mute)", fontSize: 10 }}>{shortDate(w.weekStart)}</text>
                )}
              </g>
            ))}
            {pts.length > 1 && <path d={pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} style={{ fill: "none", stroke: GOOD, strokeWidth: 2 }} />}
            {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} style={{ fill: GOOD }} />)}
          </svg>
          <div style={v.legend}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 14, height: 2, background: GOOD, display: "inline-block" }} />
              Weekly readiness (right axis, 1-5)
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--panel2)", border: "1px solid var(--line)", display: "inline-block" }} />
              Sessions done
            </span>
          </div>
        </div>
      )}
      {lowRate != null && r.lowDays > 0 && (
        <div style={v.insight}>
          On {r.lowDays} low-readiness day{r.lowDays === 1 ? "" : "s"}, {r.lowDaysCompleted} of {r.lowDaysWithSession} planned session
          {r.lowDaysWithSession === 1 ? " was" : "s were"} still trained ({lowRate}%)
          {goodRate != null ? `, against ${goodRate}% on other days.` : "."}
        </div>
      )}
    </div>
  );
}

// ── Skipped & swapped ────────────────────────────────────────────────────────

export function AdherenceList({ rows, max = 8, onHide }: { rows: AdherenceRow[]; max?: number; onHide?: (name: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {rows.slice(0, max).map((r) => {
        // "As written" = done, and not swapped for something else.
        const swaps = r.swapped.reduce((n, s) => n + s.times, 0);
        const rate = r.programmed ? Math.round((Math.max(r.completed - swaps, 0) / r.programmed) * 100) : 0;
        return (
          <div key={r.exercise} style={v.adhRow}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", display: "flex", gap: 6, alignItems: "center" }}>
                {r.exercise}
                <HideExerciseBtn name={r.exercise} onHide={onHide} />
              </div>
              <div style={{ fontSize: 12, color: "var(--mute)", marginTop: 2 }}>
                {r.skipped > 0 && `Skipped ${r.skipped} of ${r.programmed}`}
                {r.skipped > 0 && r.swapped.length > 0 && " · "}
                {r.swapped.length > 0 && `Swapped for ${r.swapped.map((s) => `${s.to}${s.times > 1 ? ` (×${s.times})` : ""}`).join(", ")}`}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <div style={{ ...v.goalTrack, width: 80, marginTop: 0 }}>
                <div style={{ ...v.goalFill, width: `${rate}%`, background: rate >= 80 ? GOOD : rate >= 50 ? WARN : BAD }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", minWidth: 34, textAlign: "right" }}>{rate}%</span>
            </div>
          </div>
        );
      })}
      {rows.length > max && <div style={v.more}>+ {rows.length - max} more</div>}
    </div>
  );
}

// ── Benchmark workout repeats ────────────────────────────────────────────────

function fmtBench(n: number | null): string {
  if (n == null) return "-";
  return Number.isInteger(n) ? String(n) : n.toFixed(Math.abs(n) < 10 ? 2 : 1);
}

export function BenchmarkTables({ groups }: { groups: BenchmarkGroup[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {groups.map((g) => (
        <div key={g.name} style={v.benchCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{g.name}</div>
            <div style={{ fontSize: 11, color: "var(--mute)" }}>
              {g.totalAttempts} attempts{g.totalAttempts > g.attempts.length ? ` · first and latest ${g.attempts.length - 1} shown` : ""}
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={v.benchTh}></th>
                  {g.attempts.map((d) => (
                    <th key={d} style={{ ...v.benchTh, textAlign: "right" }}>{shortDate(d)}</th>
                  ))}
                  <th style={{ ...v.benchTh, textAlign: "right" }}>Change</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={`${r.group}-${r.label}`}>
                    <td style={v.benchTd}>
                      <div style={{ fontWeight: 600, color: "var(--text)" }}>{r.group}</div>
                      <div style={{ color: "var(--mute)", fontSize: 11 }}>
                        {r.label}
                        {r.lowerIsBetter && r.improved !== null ? " · lower is better" : ""}
                      </div>
                    </td>
                    {r.values.map((val, i) => (
                      <td key={i} style={{ ...v.benchTd, textAlign: "right", color: "var(--text)" }}>{fmtBench(val)}</td>
                    ))}
                    <td style={{ ...v.benchTd, textAlign: "right", fontWeight: 700, color: r.improved == null ? "var(--mute)" : r.improved ? GOOD : BAD, whiteSpace: "nowrap" }}>
                      {r.changePct == null ? "-" : `${r.improved == null ? "" : r.improved ? "▲ " : "▼ "}${Math.abs(r.changePct).toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Heart-rate zone split ────────────────────────────────────────────────────

export const ZONE_COLOUR: Record<number, string> = { 1: "#94A3B8", 2: "#3B82F6", 3: "#10B981", 4: "#F59E0B", 5: "#E5484D" };

export function HrZoneChart({ split }: { split: HrZoneSplit }) {
  const unit = split.basis === "minutes" ? "min" : "efforts";
  return (
    <div>
      <div style={{ display: "flex", height: 26, borderRadius: 7, overflow: "hidden", border: "1px solid var(--line)" }}>
        {split.zones.filter((z) => z.pct > 0).map((z) => (
          <div key={z.n} title={`Z${z.n} ${z.name}: ${z.pct}%`} style={{ width: `${z.pct}%`, background: ZONE_COLOUR[z.n], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", minWidth: 0, overflow: "hidden" }}>
            {z.pct >= 8 ? `Z${z.n}` : ""}
          </div>
        ))}
      </div>
      <div style={{ ...v.cardGrid, marginTop: 12 }}>
        {([
          ["Easy", "Z1–2", split.easyPct, ZONE_COLOUR[2]],
          ["Moderate", "Z3", split.moderatePct, ZONE_COLOUR[3]],
          ["Hard", "Z4–5", split.hardPct, ZONE_COLOUR[5]],
        ] as const).map(([label, zones, pct, colour]) => (
          <div key={label} style={{ ...v.card, borderTop: `2px solid ${colour}` }}>
            <div style={v.cardLabel}>{label} <span style={{ fontWeight: 600 }}>· {zones}</span></div>
            <div style={{ ...v.cardValue, fontSize: 28 }}>{pct}%</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {split.zones.map((z) => (
          <div key={z.n} style={{ display: "grid", gridTemplateColumns: "minmax(130px, 34%) 1fr 92px", alignItems: "center", gap: 10, breakInside: "avoid" }}>
            <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: ZONE_COLOUR[z.n], display: "inline-block", flexShrink: 0 }} />
              Z{z.n} {z.name}
              <span style={{ fontSize: 11, color: "var(--mute)", fontWeight: 500 }}>{z.low}–{z.high}</span>
            </div>
            <div style={v.goalTrack}>
              <div style={{ ...v.goalFill, width: `${z.pct}%`, background: ZONE_COLOUR[z.n] }} />
            </div>
            <div style={{ fontSize: 12, color: "var(--text)", textAlign: "right", whiteSpace: "nowrap" }}>
              <b>{z.pct}%</b> <span style={{ color: "var(--mute)" }}>· {z.amount} {unit}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ ...v.more, marginTop: 10 }}>
        From {split.sessions} cardio/hybrid session{split.sessions === 1 ? "" : "s"} with heart rate logged ({split.total} {unit}). Each block counts in the zone of
        its average heart rate.{split.maxHrSource === "estimated" ? " Max HR estimated from age - set it on the athlete's profile for accurate zones." : ""}
      </div>
    </div>
  );
}

const v: Record<string, React.CSSProperties> = {
  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))", gap: 8 },
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 12px", breakInside: "avoid", minWidth: 0 },
  cardLabel: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.05em" },
  cardValue: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 34, fontWeight: 700, color: "var(--text)", lineHeight: 1.1, marginTop: 4 },
  cardSub: { fontSize: 12, color: "var(--mute)", marginTop: 2 },
  meter: { height: 6, background: "var(--line)", borderRadius: 3, overflow: "hidden", marginTop: 6 },
  meterFill: { height: "100%", borderRadius: 3 },
  delta: { fontSize: 11, color: "var(--mute)", marginTop: 8, fontWeight: 600 },
  pbGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 },
  hideBtn: { background: "transparent", border: "1px solid #E5484D55", color: "#E5484D", borderRadius: 999, width: 18, height: 18, fontSize: 10, lineHeight: "16px", padding: 0, cursor: "pointer", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" },
  pbCard: { background: "var(--panel)", border: "1px solid var(--line)", borderTop: `2px solid ${GOLD}`, borderRadius: 12, padding: "12px 14px", breakInside: "avoid", minWidth: 0 },
  pbExercise: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.05em", lineHeight: 1.35 },
  pbValue: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, color: "var(--text)", lineHeight: 1.1, marginTop: 6 },
  pbMeta: { display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: GOLD, marginTop: 6, flexWrap: "wrap" },
  more: { fontSize: 12, color: "var(--mute)", marginTop: 8 },
  barRow: { display: "flex", flexDirection: "column", gap: 4, breakInside: "avoid" },
  barTop: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 },
  barNums: { display: "flex", alignItems: "baseline", gap: 10, flexShrink: 0 },
  barName: { fontSize: 13, fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: 6, minWidth: 0, flexWrap: "wrap" },
  tag: { fontSize: 9, fontWeight: 800, textTransform: "uppercase", border: "1px solid", borderRadius: 999, padding: "1px 6px", flexShrink: 0 },
  barTrack: { position: "relative", height: 12, background: "var(--panel2)", borderRadius: 5 },
  zeroLine: { position: "absolute", top: 0, bottom: 0, width: 1, background: "var(--mute)", opacity: 0.6 },
  barPct: { fontSize: 13, fontWeight: 700, textAlign: "right", minWidth: 52 },
  barRange: { fontSize: 11, color: "var(--mute)", whiteSpace: "nowrap" },
  smGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 },
  smCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px", breakInside: "avoid" },
  smName: { fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  smValue: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 700, color: "var(--text)", margin: "2px 0 4px" },
  smAxis: { display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--mute)", marginTop: 3 },
  compRow: { display: "flex", alignItems: "center", gap: 14, background: "var(--panel)", border: "1px solid var(--line)", borderLeft: "3px solid var(--accent)", borderRadius: 12, padding: "10px 14px", breakInside: "avoid" },
  compDays: { textAlign: "center", minWidth: 64 },
  verdictGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 },
  verdictCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", breakInside: "avoid" },
  verdictText: { fontSize: 13, color: "var(--text)", lineHeight: 1.5, marginTop: 8, whiteSpace: "pre-wrap" },
  verdictInput: { width: "100%", marginTop: 8, background: "var(--ink)", border: "1px solid var(--accent)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 13, lineHeight: 1.45, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" },
  editBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 },
  goalCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", breakInside: "avoid" },
  statusPill: { fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", border: "1px solid", borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" },
  goalTrack: { height: 8, background: "var(--panel2)", borderRadius: 4, overflow: "hidden", marginTop: 8 },
  goalFill: { height: "100%", borderRadius: 4 },
  insight: { fontSize: 13, color: "var(--text)", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", marginTop: 12, lineHeight: 1.45 },
  adhRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--line)", breakInside: "avoid" },
  benchCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", breakInside: "avoid" },
  benchTh: { fontSize: 10, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "4px 6px", borderBottom: "1px solid var(--line)", textAlign: "left", whiteSpace: "nowrap" },
  benchTd: { padding: "7px 6px", borderBottom: "1px solid var(--line)", verticalAlign: "top" },
  legend: { display: "flex", flexWrap: "wrap", gap: 14, fontSize: 11, color: "var(--mute)", marginTop: 8, alignItems: "center" },
};

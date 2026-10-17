"use client";

// Visual summary blocks for the Training Report (ReportModal): headline
// cards, PB wall, progress bars, per-exercise trend charts, consistency
// calendar and weekly sessions chart. Everything is inline styles + SVG
// built on the theme CSS variables, because Print clones the report's
// DOM into a blank window that redefines those variables for paper
// (light background) - anything not inline wouldn't survive the trip.

import type { CalendarDay, Headline, ReportPB, VisualSessionType, WeeklySessions } from "@/lib/report-visuals";

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

function pbValue(pb: ReportPB): string {
  if (pb.kind === "bw_time") return pb.timeSeconds != null ? `${pb.timeSeconds}s hold` : "-";
  if (pb.kind === "bw_reps") return pb.reps != null ? `${pb.reps} reps` : "-";
  if (pb.weightKg == null) return "-";
  return pb.reps ? `${pb.weightKg}kg × ${pb.reps}` : `${pb.weightKg}kg`;
}

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

export function PBWall({ pbs, max = 12 }: { pbs: ReportPB[]; max?: number }) {
  // One card per exercise (and PB kind): its newest PB - always the
  // best, since each new PB beat the last - with a count when the
  // athlete set several in the period.
  const groups = new Map<string, { pb: ReportPB; count: number }>();
  for (const pb of pbs) {
    const key = `${pb.exercise.toLowerCase()}|${pb.kind}`;
    const g = groups.get(key);
    if (!g) groups.set(key, { pb, count: 1 });
    else {
      g.count++;
      if (pb.date > g.pb.date) g.pb = pb;
    }
  }
  const cards = Array.from(groups.values()).sort((a, b) => b.pb.date.localeCompare(a.pb.date));
  const shown = cards.slice(0, max);
  return (
    <>
      <div style={v.pbGrid}>
        {shown.map(({ pb, count }, i) => (
          <div key={`${pb.exercise}-${pb.kind}-${i}`} style={v.pbCard}>
            <div style={v.pbExercise}>{pb.exercise}</div>
            <div style={v.pbValue}>{pbValue(pb)}</div>
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

export function ProgressBars({ rows, unit, decimals = 0 }: { rows: ProgressRow[]; unit: string; decimals?: number }) {
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

export function SmallMultiples({ series, unit, decimals = 0 }: { series: TrendSeries[]; unit: string; decimals?: number }) {
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
              {s.pct != null && <div style={{ fontSize: 12, fontWeight: 700, color: colour, whiteSpace: "nowrap" }}>{fmtPct(s.pct)}</div>}
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
  legend: { display: "flex", flexWrap: "wrap", gap: 14, fontSize: 11, color: "var(--mute)", marginTop: 8, alignItems: "center" },
};

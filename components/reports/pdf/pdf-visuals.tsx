// PDF (react-pdf) versions of the Training Report's visual summary -
// the same data and wording as components/reports/ReportVisuals.tsx,
// redrawn with react-pdf primitives (flex rows instead of CSS grid,
// Svg shapes instead of DOM SVG) for the bulk "Generate reports" export.
"use client";

import { View, Text, StyleSheet, Svg, Polyline, Polygon, Rect, Circle } from "@react-pdf/renderer";
import {
  groupPBs,
  pbValueText,
  type AdherenceRow,
  type BenchmarkGroup,
  type CalendarDay,
  type GoalProgress,
  type Headline,
  type HrZoneSplit,
  type ProgressRowData,
  type ReadinessSummary,
  type ReportPB,
  type TrendSeriesData,
  type UpcomingCompetition,
  type WeeklySessions,
} from "@/lib/report-visuals";

export const P = {
  panel: "#f6f8fb",
  panel2: "#edf1f6",
  line: "#dfe4ec",
  text: "#16202a",
  mute: "#6b7684",
  good: "#1a8f57",
  bad: "#d14343",
  warn: "#d98a10",
  gold: "#b8901c",
};
const ZONE: Record<number, string> = { 1: "#94A3B8", 2: "#3B82F6", 3: "#10B981", 4: "#F59E0B", 5: "#E5484D" };
const TYPE_COLOUR: Record<string, string> = { strength: "#3B82F6", power_speed: "#A855F7", cardio: "#F59E0B", hyrox: "#10B981", other: "#64748B" };
const TYPE_LABEL: Record<string, string> = { strength: "Strength", power_speed: "Power/Speed", cardio: "Cardio", hyrox: "Hybrid", other: "Other" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]}`;
}
function fmtPct(p: number): string {
  return `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
}
function num(n: number | null, unit = ""): string {
  if (n == null) return "-";
  const s = Number.isInteger(n) ? String(n) : n.toFixed(Math.abs(n) < 10 ? 2 : 1);
  return `${s}${unit}`;
}

const s = StyleSheet.create({
  row: { flexDirection: "row" },
  card: { backgroundColor: P.panel, borderWidth: 0.75, borderColor: P.line, borderRadius: 6, padding: 7 },
  label: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: P.mute, letterSpacing: 0.4 },
  big: { fontSize: 17, fontFamily: "Helvetica-Bold", color: P.text, marginTop: 3 },
  sub: { fontSize: 7, color: P.mute, marginTop: 2 },
  small: { fontSize: 7, color: P.mute },
  track: { height: 5, backgroundColor: P.panel2, borderRadius: 2.5, marginTop: 4 },
  fill: { height: 5, borderRadius: 2.5 },
  pill: { fontSize: 6, fontFamily: "Helvetica-Bold", borderWidth: 0.75, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 },
});

// ── Headline ────────────────────────────────────────────────────────────────

function delta(now: number | null, before: number | null | undefined, opts: { unit?: string; neutral?: boolean; decimals?: number } = {}) {
  if (now == null || before == null) return null;
  const d = Math.round((now - before) * 10 ** (opts.decimals ?? 0)) / 10 ** (opts.decimals ?? 0);
  if (d === 0) return <Text style={[s.sub, { marginTop: 4 }]}>Same as prev.</Text>;
  const colour = opts.neutral ? P.mute : d > 0 ? P.good : P.bad;
  return <Text style={[s.sub, { marginTop: 4, color: colour, fontFamily: "Helvetica-Bold" }]}>{d > 0 ? "+" : "-"}{Math.abs(d).toFixed(opts.decimals ?? 0)}{opts.unit ?? ""} vs prev.</Text>;
}

export function PdfHeadline({ h, prev, prevLabel }: { h: Headline; prev: Headline | null; prevLabel?: string | null }) {
  const tonnes = h.totalTonnageKg / 1000;
  const cards = [
    { label: "SESSIONS DONE", value: String(h.sessionsCompleted), sub: h.sessionsAssigned ? `${h.sessionsAssigned} assigned` : "None assigned", d: delta(h.sessionsCompleted, prev?.sessionsCompleted) },
    { label: "COMPLETION", value: h.completionPct == null ? "-" : `${h.completionPct}%`, sub: "of assigned sessions", d: delta(h.completionPct, prev?.completionPct, { unit: "%" }) },
    { label: "PBS", value: String(h.pbCount), sub: "personal bests", d: delta(h.pbCount, prev?.pbCount) },
    { label: "AVG RPE", value: h.avgRpe == null ? "-" : String(h.avgRpe), sub: "out of 10", d: delta(h.avgRpe, prev?.avgRpe, { neutral: true, decimals: 1 }) },
    { label: "TOTAL LIFTED", value: tonnes >= 1 ? `${tonnes.toFixed(tonnes >= 10 ? 0 : 1)} t` : `${h.totalTonnageKg} kg`, sub: "strength tonnage", d: null },
  ];
  return (
    <View wrap={false}>
      <View style={[s.row, { gap: 5 }]}>
        {cards.map((c) => (
          <View key={c.label} style={[s.card, { flex: 1 }]}>
            <Text style={s.label}>{c.label}</Text>
            <Text style={s.big}>{c.value}</Text>
            <Text style={s.sub}>{c.sub}</Text>
            {c.d}
          </View>
        ))}
      </View>
      {prev && prevLabel && <Text style={[s.small, { marginTop: 4 }]}>&quot;Prev.&quot; = the {prevLabel}.</Text>}
    </View>
  );
}

// ── Competitions ────────────────────────────────────────────────────────────

export function PdfCompetitions({ items }: { items: UpcomingCompetition[] }) {
  return (
    <View style={{ gap: 4 }}>
      {items.map((c) => (
        <View key={`${c.title}-${c.date}`} wrap={false} style={[s.card, s.row, { alignItems: "center", gap: 10, borderLeftWidth: 2.5, borderLeftColor: "#1f6fd6" }]}>
          <View style={{ width: 52, alignItems: "center" }}>
            <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold" }}>{c.daysAway}</Text>
            <Text style={s.label}>{c.daysAway === 1 ? "DAY" : "DAYS"} TO GO</Text>
          </View>
          <View>
            <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>{c.title}</Text>
            <Text style={s.small}>{shortDate(c.date)} {c.date.slice(0, 4)}{c.location ? ` · ${c.location}` : ""}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Coach's verdict ─────────────────────────────────────────────────────────

export function PdfVerdict({ verdict }: { verdict: { wentWell: string; workOn: string; nextFocus: string } }) {
  const items = [
    { label: "WHAT WENT WELL", text: verdict.wentWell, colour: P.good },
    { label: "WHAT TO WORK ON", text: verdict.workOn, colour: P.warn },
    { label: "FOCUS FOR NEXT BLOCK", text: verdict.nextFocus, colour: "#1f6fd6" },
  ].filter((i) => i.text);
  return (
    <View style={[s.row, { gap: 5 }]} wrap={false}>
      {items.map((i) => (
        <View key={i.label} style={[s.card, { flex: 1, borderTopWidth: 2, borderTopColor: i.colour }]}>
          <Text style={[s.label, { color: i.colour }]}>{i.label}</Text>
          <Text style={{ fontSize: 8, lineHeight: 1.4, marginTop: 4 }}>{i.text}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Goals ───────────────────────────────────────────────────────────────────

const GOAL_STATUS: Record<GoalProgress["status"], [string, string]> = {
  achieved: ["ACHIEVED", P.good],
  on_track: ["ON TRACK", P.good],
  behind: ["BEHIND SCHEDULE", P.warn],
  overdue: ["PAST TARGET DATE", P.bad],
  in_progress: ["IN PROGRESS", "#1f6fd6"],
  no_data: ["NOT MEASURED YET", P.mute],
};

export function PdfGoals({ goals }: { goals: GoalProgress[] }) {
  return (
    <View style={{ gap: 4 }}>
      {goals.map((g) => {
        const [label, colour] = GOAL_STATUS[g.status];
        return (
          <View key={g.id} style={s.card} wrap={false}>
            <View style={[s.row, { justifyContent: "space-between", alignItems: "center" }]}>
              <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold" }}>{g.label}</Text>
              <Text style={[s.pill, { color: colour, borderColor: colour }]}>{label}</Text>
            </View>
            {g.target != null ? (
              <>
                <Text style={[s.sub, { color: P.text }]}>
                  <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11 }}>{num(g.current, g.unit === "kg" ? "kg" : g.unit ? ` ${g.unit}` : "")}</Text>
                  {`  of ${num(g.target, g.unit === "kg" ? "kg" : g.unit ? ` ${g.unit}` : "")}${g.start != null ? ` · started at ${num(g.start, g.unit === "kg" ? "kg" : "")}` : ""}`}
                </Text>
                <View style={s.track}>
                  <View style={[s.fill, { width: `${Math.round((g.pct ?? 0) * 100)}%`, backgroundColor: colour }]} />
                </View>
              </>
            ) : (
              g.note && <Text style={[s.sub, { color: P.text }]}>{g.note}</Text>
            )}
            {g.targetDate && (
              <Text style={[s.small, { marginTop: 3 }]}>
                Target date {shortDate(g.targetDate)} {g.targetDate.slice(0, 4)}
                {g.daysLeft != null && g.daysLeft >= 0 && g.status !== "achieved" ? ` · ${g.daysLeft} days left` : ""}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ── PBs ─────────────────────────────────────────────────────────────────────

export function PdfPBs({ pbs, max = 12 }: { pbs: ReportPB[]; max?: number }) {
  const cards = groupPBs(pbs);
  return (
    <View>
      <View style={[s.row, { flexWrap: "wrap", gap: 5 }]}>
        {cards.slice(0, max).map(({ pb, count }, i) => (
          <View key={i} wrap={false} style={[s.card, { width: "24%", borderTopWidth: 1.5, borderTopColor: P.gold }]}>
            <Text style={s.label}>{pb.exercise.toUpperCase()}</Text>
            <Text style={[s.big, { fontSize: 13 }]}>{pbValueText(pb).replace("×", "x")}</Text>
            <Text style={[s.sub, { color: P.gold, fontFamily: "Helvetica-Bold" }]}>
              {shortDate(pb.date)}
              {count > 1 ? `  ·  ${count} PBs` : ""}
            </Text>
          </View>
        ))}
      </View>
      {cards.length > max && <Text style={[s.small, { marginTop: 4 }]}>+ {cards.length - max} more exercises with PBs</Text>}
    </View>
  );
}

// ── Progress bars ───────────────────────────────────────────────────────────

export function PdfProgressBars({ rows, unit, decimals = 0 }: { rows: ProgressRowData[]; unit: string; decimals?: number }) {
  const sorted = [...rows].sort((a, b) => b.pct - a.pct);
  const maxAbs = Math.max(5, ...sorted.map((r) => Math.abs(r.pct)));
  const hasNeg = sorted.some((r) => r.pct < 0);
  const zero = hasNeg ? 40 : 0;
  const reviewFrom = sorted.length >= 6 ? sorted.length - 3 : Infinity;
  return (
    <View style={{ gap: 5 }}>
      {sorted.map((r, i) => {
        const w = (Math.abs(r.pct) / maxAbs) * (r.pct >= 0 ? 100 - zero : zero);
        const colour = r.pct > 0 ? P.good : r.pct < 0 ? P.bad : P.mute;
        return (
          <View key={r.name} wrap={false}>
            <View style={[s.row, { justifyContent: "space-between", alignItems: "center" }]}>
              <View style={[s.row, { alignItems: "center", gap: 4 }]}>
                <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold" }}>{r.name}</Text>
                {i < 3 && r.pct > 0 && <Text style={[s.pill, { color: P.good, borderColor: P.good }]}>TOP</Text>}
                {i >= reviewFrom && <Text style={[s.pill, { color: P.warn, borderColor: P.warn }]}>{r.pct > 0 ? "SLOWEST" : "REVIEW"}</Text>}
              </View>
              <Text style={{ fontSize: 7.5 }}>
                <Text style={{ color: P.mute }}>{`${r.first.toFixed(decimals)} > ${r.latest.toFixed(decimals)}${unit}   `}</Text>
                <Text style={{ color: colour, fontFamily: "Helvetica-Bold" }}>{fmtPct(r.pct)}</Text>
              </Text>
            </View>
            <View style={[s.track, { height: 6, position: "relative" }]}>
              <View style={[s.fill, { height: 6, position: "absolute", left: `${r.pct >= 0 ? zero : zero - w}%`, width: `${Math.max(w, 0.8)}%`, backgroundColor: colour }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Exercise trend grid ─────────────────────────────────────────────────────

function Mini({ points, colour }: { points: { value: number }[]; colour: string }) {
  const W = 150, H = 40, pad = 3;
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max === min) { max += 1; min -= 1; }
  const x = (i: number) => (points.length === 1 ? W / 2 : pad + (i / (points.length - 1)) * (W - pad * 2));
  const y = (v: number) => pad + (1 - (v - min) / (max - min)) * (H - pad * 2);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Polygon points={`${line} ${x(points.length - 1).toFixed(1)},${H} ${x(0).toFixed(1)},${H}`} fill={colour} fillOpacity={0.12} />
      <Polyline points={line} stroke={colour} strokeWidth={1.4} fill="none" />
      <Circle cx={x(points.length - 1)} cy={y(points[points.length - 1].value)} r={2} fill={colour} />
    </Svg>
  );
}

export function PdfTrendGrid({ series, unit, decimals = 0 }: { series: TrendSeriesData[]; unit: string; decimals?: number }) {
  return (
    <View style={[s.row, { flexWrap: "wrap", gap: 5 }]}>
      {series.map((sr) => {
        const vals = sr.points.map((p) => p.value);
        const colour = sr.pct == null || sr.pct === 0 ? "#1f6fd6" : sr.pct > 0 ? P.good : P.bad;
        return (
          <View key={sr.name} wrap={false} style={[s.card, { width: "32.4%" }]}>
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", maxWidth: "75%" }}>{sr.name}</Text>
              {sr.pct != null && <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: colour }}>{fmtPct(sr.pct)}</Text>}
            </View>
            <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", marginVertical: 2 }}>
              {vals[vals.length - 1].toFixed(decimals)}
              <Text style={{ fontSize: 7, color: P.mute }}> {unit}</Text>
            </Text>
            <Mini points={sr.points} colour={colour} />
            <View style={[s.row, { justifyContent: "space-between", marginTop: 2 }]}>
              <Text style={s.small}>{shortDate(sr.points[0].date)}</Text>
              <Text style={s.small}>{shortDate(sr.points[sr.points.length - 1].date)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Benchmarks ──────────────────────────────────────────────────────────────

export function PdfBenchmarks({ groups }: { groups: BenchmarkGroup[] }) {
  return (
    <View style={{ gap: 6 }}>
      {groups.map((g) => (
        <View key={g.name} style={s.card} wrap={false}>
          <View style={[s.row, { justifyContent: "space-between", marginBottom: 4 }]}>
            <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold" }}>{g.name}</Text>
            <Text style={s.small}>{g.totalAttempts} attempts</Text>
          </View>
          <View style={[s.row, { borderBottomWidth: 0.75, borderBottomColor: P.line, paddingBottom: 2 }]}>
            <Text style={[s.label, { flex: 3 }]}> </Text>
            {g.attempts.map((d) => (
              <Text key={d} style={[s.label, { flex: 1, textAlign: "right" }]}>{shortDate(d).toUpperCase()}</Text>
            ))}
            <Text style={[s.label, { flex: 1.2, textAlign: "right" }]}>CHANGE</Text>
          </View>
          {g.rows.map((r) => (
            <View key={`${r.group}-${r.label}`} style={[s.row, { paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: P.line }]}>
              <View style={{ flex: 3 }}>
                <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold" }}>{r.group}</Text>
                <Text style={s.small}>{r.label}{r.lowerIsBetter && r.improved !== null ? " · lower is better" : ""}</Text>
              </View>
              {r.values.map((val, i) => (
                <Text key={i} style={{ flex: 1, textAlign: "right", fontSize: 8 }}>{num(val)}</Text>
              ))}
              <Text style={{ flex: 1.2, textAlign: "right", fontSize: 8, fontFamily: "Helvetica-Bold", color: r.improved == null ? P.mute : r.improved ? P.good : P.bad }}>
                {r.changePct == null ? "-" : `${r.improved == null ? "" : r.improved ? "+ " : "- "}${Math.abs(r.changePct).toFixed(1)}%`}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ── HR zones ────────────────────────────────────────────────────────────────

export function PdfHrZones({ split }: { split: HrZoneSplit }) {
  const unit = split.basis === "minutes" ? "min" : "efforts";
  return (
    <View wrap={false}>
      <View style={[s.row, { height: 12, borderRadius: 3, overflow: "hidden" }]}>
        {split.zones.filter((z) => z.pct > 0).map((z) => (
          <View key={z.n} style={{ width: `${z.pct}%`, backgroundColor: ZONE[z.n] }} />
        ))}
      </View>
      <View style={[s.row, { gap: 5, marginTop: 6 }]}>
        {([["EASY · Z1-2", split.easyPct, ZONE[2]], ["MODERATE · Z3", split.moderatePct, ZONE[3]], ["HARD · Z4-5", split.hardPct, ZONE[5]]] as const).map(([l, p, c]) => (
          <View key={l} style={[s.card, { flex: 1, borderTopWidth: 1.5, borderTopColor: c }]}>
            <Text style={s.label}>{l}</Text>
            <Text style={s.big}>{p}%</Text>
          </View>
        ))}
      </View>
      <View style={{ marginTop: 6, gap: 3 }}>
        {split.zones.map((z) => (
          <View key={z.n} style={[s.row, { alignItems: "center", gap: 6 }]}>
            <Text style={{ fontSize: 7.5, width: 120 }}>Z{z.n} {z.name} ({z.low}-{z.high})</Text>
            <View style={[s.track, { flex: 1, marginTop: 0 }]}>
              <View style={[s.fill, { width: `${z.pct}%`, backgroundColor: ZONE[z.n] }]} />
            </View>
            <Text style={{ fontSize: 7.5, width: 70, textAlign: "right" }}>{z.pct}% · {z.amount} {unit}</Text>
          </View>
        ))}
      </View>
      <Text style={[s.small, { marginTop: 5 }]}>
        From {split.sessions} cardio/hybrid sessions with heart rate logged. Each block counts in the zone of its average heart rate.
        {split.maxHrSource === "estimated" ? " Max HR estimated from age." : ""}
      </Text>
    </View>
  );
}

// ── Consistency ─────────────────────────────────────────────────────────────

const STATUS_FILL: Record<CalendarDay["status"], string> = { done: P.good, partial: P.warn, missed: P.bad, upcoming: "#ffffff", rest: P.panel2 };

export function PdfConsistency({ days, weekly }: { days: CalendarDay[]; weekly: WeeklySessions[] }) {
  const firstDow = (new Date(days[0].date + "T12:00:00Z").getUTCDay() + 6) % 7;
  const cells: (CalendarDay | null)[] = [...Array(firstDow).fill(null), ...days];
  const weeks: (CalendarDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const counts = { done: 0, partial: 0, missed: 0 };
  for (const d of days) if (d.status in counts) counts[d.status as keyof typeof counts]++;
  const judged = counts.done + counts.partial + counts.missed;
  const C = 9, G = 2;

  const types = ["strength", "power_speed", "cardio", "hyrox", "other"] as const;
  const present = types.filter((t) => weekly.some((w) => w.completed[t] > 0));
  const maxS = Math.max(1, ...weekly.map((w) => types.reduce((a, t) => a + w.completed[t], 0) + w.missed));
  const W = 520, H = 90;
  const slot = W / Math.max(weekly.length, 1);
  const barW = Math.min(18, slot * 0.6);

  return (
    <View wrap={false}>
      <Svg width={weeks.length * (C + G)} height={7 * (C + G)}>
        {weeks.map((wk, wi) =>
          wk.map((d, di) =>
            d ? (
              <Rect key={`${wi}-${di}`} x={wi * (C + G)} y={di * (C + G)} width={C} height={C} rx={2} fill={STATUS_FILL[d.status]} stroke={d.status === "upcoming" ? P.mute : undefined} strokeWidth={d.status === "upcoming" ? 0.5 : 0} />
            ) : null
          )
        )}
      </Svg>
      <View style={[s.row, { gap: 10, marginTop: 4 }]}>
        {(["done", "partial", "missed"] as const).map((k) => (
          <View key={k} style={[s.row, { alignItems: "center", gap: 3 }]}>
            <View style={{ width: 6, height: 6, borderRadius: 1, backgroundColor: STATUS_FILL[k] }} />
            <Text style={s.small}>{k === "done" ? "Done" : k === "partial" ? "Partly done" : "Missed"} ({counts[k]})</Text>
          </View>
        ))}
        {judged > 0 && <Text style={[s.small, { marginLeft: "auto", color: P.text, fontFamily: "Helvetica-Bold" }]}>{Math.round((counts.done / judged) * 100)}% of session days fully done</Text>}
      </View>

      {weekly.length > 1 && (
        <View style={{ marginTop: 10 }}>
          <Text style={[s.label, { marginBottom: 4 }]}>SESSIONS PER WEEK</Text>
          <Svg width={W} height={H}>
            <Rect x={0} y={H - 0.5} width={W} height={0.5} fill={P.line} />
            {weekly.map((w, i) => {
              let acc = 0;
              const x = i * slot + (slot - barW) / 2;
              const yOf = (n: number) => H - (n / maxS) * (H - 4);
              return [
                ...present.map((t) => {
                  const n = w.completed[t];
                  if (!n) return null;
                  const y = yOf(acc + n), h = yOf(acc) - y;
                  acc += n;
                  return <Rect key={`${i}-${t}`} x={x} y={y} width={barW} height={h} fill={TYPE_COLOUR[t]} />;
                }),
                w.missed ? <Rect key={`${i}-m`} x={x} y={yOf(acc + w.missed)} width={barW} height={yOf(acc) - yOf(acc + w.missed)} fill={P.bad} fillOpacity={0.2} stroke={P.bad} strokeWidth={0.75} /> : null,
              ];
            })}
          </Svg>
          <View style={[s.row, { justifyContent: "space-between", width: W, marginTop: 2 }]}>
            <Text style={s.small}>{shortDate(weekly[0].weekStart)}</Text>
            <Text style={s.small}>{shortDate(weekly[weekly.length - 1].weekStart)}</Text>
          </View>
          <View style={[s.row, { gap: 10, marginTop: 3 }]}>
            {present.map((t) => (
              <View key={t} style={[s.row, { alignItems: "center", gap: 3 }]}>
                <View style={{ width: 6, height: 6, borderRadius: 1, backgroundColor: TYPE_COLOUR[t] }} />
                <Text style={s.small}>{TYPE_LABEL[t]}</Text>
              </View>
            ))}
            {weekly.some((w) => w.missed > 0) && <Text style={[s.small, { color: P.bad }]}>Missed (outlined)</Text>}
          </View>
        </View>
      )}
    </View>
  );
}

// ── Readiness ───────────────────────────────────────────────────────────────

export function PdfReadiness({ r }: { r: ReadinessSummary }) {
  const gauges: [string, number, boolean][] = [["READINESS", r.avgReadiness, false], ["SLEEP", r.avgSleep, false], ["ENERGY", r.avgEnergy, false], ["SORENESS", r.avgSoreness, true]];
  const lowRate = r.lowDaysWithSession ? Math.round((r.lowDaysCompleted / r.lowDaysWithSession) * 100) : null;
  const goodRate = r.goodDaysWithSession ? Math.round((r.goodDaysCompleted / r.goodDaysWithSession) * 100) : null;
  return (
    <View wrap={false}>
      <View style={[s.row, { gap: 5 }]}>
        {gauges.map(([label, value, invert]) => {
          const good = invert ? 6 - value : value;
          const colour = good >= 3.5 ? P.good : good >= 2.5 ? P.warn : P.bad;
          return (
            <View key={label} style={[s.card, { flex: 1 }]}>
              <Text style={s.label}>{label}</Text>
              <Text style={s.big}>{value.toFixed(1)}<Text style={{ fontSize: 7, color: P.mute }}> /5</Text></Text>
              <View style={s.track}><View style={[s.fill, { width: `${(value / 5) * 100}%`, backgroundColor: colour }]} /></View>
              {invert && <Text style={s.small}>Lower is better</Text>}
            </View>
          );
        })}
      </View>
      <Text style={[s.small, { marginTop: 4 }]}>From {r.checkins} check-ins. Readiness combines sleep, energy and soreness.</Text>
      {lowRate != null && r.lowDays > 0 && (
        <Text style={{ fontSize: 8, marginTop: 4 }}>
          On {r.lowDays} low-readiness day{r.lowDays === 1 ? "" : "s"}, {r.lowDaysCompleted} of {r.lowDaysWithSession} planned sessions were still trained ({lowRate}%){goodRate != null ? `, against ${goodRate}% on other days.` : "."}
        </Text>
      )}
    </View>
  );
}

// ── Skipped & swapped ───────────────────────────────────────────────────────

export function PdfAdherence({ rows, max = 8 }: { rows: AdherenceRow[]; max?: number }) {
  return (
    <View>
      {rows.slice(0, max).map((r) => {
        const swaps = r.swapped.reduce((n, x) => n + x.times, 0);
        const rate = r.programmed ? Math.round((Math.max(r.completed - swaps, 0) / r.programmed) * 100) : 0;
        return (
          <View key={r.exercise} wrap={false} style={[s.row, { justifyContent: "space-between", alignItems: "center", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: P.line }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold" }}>{r.exercise}</Text>
              <Text style={s.small}>
                {[r.skipped > 0 ? `Skipped ${r.skipped} of ${r.programmed}` : "", r.swapped.length ? `Swapped for ${r.swapped.map((x) => `${x.to}${x.times > 1 ? ` (x${x.times})` : ""}`).join(", ")}` : ""].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <View style={[s.track, { width: 60, marginTop: 0 }]}>
              <View style={[s.fill, { width: `${rate}%`, backgroundColor: rate >= 80 ? P.good : rate >= 50 ? P.warn : P.bad }]} />
            </View>
            <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", width: 30, textAlign: "right" }}>{rate}%</Text>
          </View>
        );
      })}
    </View>
  );
}

// PDF version of the Squad Report tab - same "open in a new browser
// tab" print flow as AthleteReportPdf (see app/(coach)/reporting/
// page.tsx's handlePreview), since an embedded iframe's print button
// is unreliable across browsers but a real tab's native PDF viewer
// always works. No charts here (leaderboards are just ranked lists),
// so this is a much smaller file than AthleteReportPdf.
"use client";

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import {
  computeAthleteTrendExercises,
  chunkExercises,
  type SquadReport,
  type SquadStandingRow,
  type SquadImprovedRow,
  type SquadCompletionRow,
  type SquadMatrixRow,
  type SquadExerciseCell,
  type SquadAthleteInput,
  type SquadPowerSpeedBoard,
} from "@/lib/squad-report";
import { LineChart } from "@/components/reports/pdf/pdf-line-chart";
import BrandHeader from "@/components/reports/pdf/pdf-brand-header";
import { DEFAULT_BRANDING, type ResolvedBranding } from "@/types/branding";

const C = {
  text: "#16202a",
  mute: "#6b7684",
  accent: "#1f6fd6",
  accentDim: "#e7f0fb",
  good: "#1a8f57",
  bad: "#c23a3a",
  line: "#d8dde3",
  panel: "#f7f8fa",
};

function fmtPct(pct: number): string {
  return (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
}
function pctColor(pct: number): string {
  return pct >= 0 ? C.good : C.bad;
}

const s = StyleSheet.create({
  page: { padding: 32, fontFamily: "Helvetica", fontSize: 9, color: C.text, backgroundColor: "#ffffff" },
  titleLine: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 4 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  metaLine: { fontSize: 8, color: C.mute, marginTop: 2 },
  // flexWrap so a metric with more than two boards (e.g. e1RM with
  // several ticked exercises) wraps onto new lines instead of being
  // squeezed into one row - fixed % basis rather than flex:1 so each
  // board keeps a sane width regardless of how many share the row.
  metricRow: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 18 },
  board: { flexBasis: "47%", flexGrow: 1, backgroundColor: C.panel, borderRadius: 6, padding: 12, marginBottom: 4 },
  boardTitle: { fontFamily: "Helvetica-Bold", fontSize: 10, color: C.accent, marginBottom: 8, letterSpacing: 0.4 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: C.line },
  rank: { width: 16, fontFamily: "Helvetica-Bold", fontSize: 8, color: C.mute },
  name: { flex: 1, fontSize: 9, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 7, color: C.mute, fontFamily: "Helvetica" },
  value: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  empty: { fontSize: 8, color: C.mute, fontStyle: "italic" as const },
  // Two header rows fake a merged cell (react-pdf has no colspan) - row
  // 1 (the exercise name, spanning its Load+%-Change pair) and row 2
  // (the Load/%-Change sub-labels) share the same tinted band so they
  // read as one two-line header block; the accent rule sits once,
  // below row 2 only (see matrixHeaderCellSub).
  matrixHeaderRow: { flexDirection: "row", backgroundColor: C.accentDim, paddingVertical: 5, marginTop: 18 },
  matrixHeaderCell: { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: C.accent, paddingHorizontal: 4, letterSpacing: 0.3 },
  matrixHeaderCellSub: { fontFamily: "Helvetica-Bold", fontSize: 6.5, color: C.mute, paddingHorizontal: 4, letterSpacing: 0.2, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: C.accent },
  matrixRow: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: C.line },
  matrixCell: { fontSize: 8, paddingHorizontal: 4 },
  matrixNameCell: { fontFamily: "Helvetica-Bold", fontSize: 8, paddingHorizontal: 4 },
  trendGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 16 },
  trendCell: { backgroundColor: C.panel, borderRadius: 6, padding: 8 },
  trendChartTitle: { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: C.accent, marginBottom: 4, letterSpacing: 0.3 },
});

// Squad Overview matrix (landscape pages) - single-line cells only,
// deliberately: never a second stacked Text sibling inside a centered
// row, to sidestep the react-pdf layout bug where a flex:1 View with
// two stacked Text children inside alignItems:"center" collapses them
// on top of each other (see the leaderboard rows above, which hit
// this and were rewritten to a single Text with an embedded newline
// instead - here each value/% pair is just two separate flex columns,
// not stacked text, so it doesn't apply).
//
// Two separate sheets (TTL, e1RM) rather than one combined one - each
// ticked exercise gets its own value+%-change column pair, replacing
// an earlier single "most improved" summary column that only ever
// showed one exercise per athlete.
const EMPTY_CELL: SquadExerciseCell = { value: null, pct: null };
function fmtCellValue(cell: SquadExerciseCell | undefined, decimals: number, unit: string): string {
  const v = (cell ?? EMPTY_CELL).value;
  return v == null ? "–" : `${v.toFixed(decimals)}${unit}`;
}
function fmtCellPct(cell: SquadExerciseCell | undefined): { text: string; color?: string } {
  const pct = (cell ?? EMPTY_CELL).pct;
  return pct == null ? { text: "–" } : { text: fmtPct(pct), color: pctColor(pct) };
}

interface MatrixColumn {
  label: string; // sub-header (row 2) if grouped, otherwise the only header
  group?: string; // exercise name - consecutive columns sharing a group get ONE merged header cell (row 1) spanning both
  width: number;
  get: (r: SquadMatrixRow) => { text: string; color?: string };
}

function buildTtlColumns(exercises: string[], completion: boolean): MatrixColumn[] {
  const cols: MatrixColumn[] = [
    { label: "Athlete", width: 1.6, get: (r) => ({ text: r.athleteName }) },
    { label: "TTL Total (kg)", width: 1.1, get: (r) => ({ text: r.ttlTotal != null ? r.ttlTotal.toFixed(0) : "–" }) },
  ];
  for (const name of exercises) {
    cols.push({ label: "Load (kg)", group: name, width: 1.1, get: (r) => ({ text: fmtCellValue(r.ttlByExercise[name], 0, "kg") }) });
    cols.push({ label: "% Change", group: name, width: 0.9, get: (r) => fmtCellPct(r.ttlByExercise[name]) });
  }
  if (completion) {
    cols.push({ label: "Completion", width: 0.9, get: (r) => ({ text: r.completionPct != null ? `${r.completionPct.toFixed(0)}%` : "–" }) });
  }
  return cols;
}

function buildE1rmColumns(exercises: string[], completion: boolean, bodyweightRelative: boolean): MatrixColumn[] {
  const unit = bodyweightRelative ? "×BW" : "kg";
  const decimals = bodyweightRelative ? 2 : 1;
  const cols: MatrixColumn[] = [{ label: "Athlete", width: 1.6, get: (r) => ({ text: r.athleteName }) }];
  for (const name of exercises) {
    cols.push({ label: `e1RM (${unit})`, group: name, width: 1.1, get: (r) => ({ text: fmtCellValue(r.e1rmByExercise[name], decimals, unit) }) });
    cols.push({ label: "% Change", group: name, width: 0.9, get: (r) => fmtCellPct(r.e1rmByExercise[name]) });
  }
  if (completion) {
    cols.push({ label: "Completion", width: 0.9, get: (r) => ({ text: r.completionPct != null ? `${r.completionPct.toFixed(0)}%` : "–" }) });
  }
  return cols;
}

// Builds the two header rows react-pdf has to fake, since it has no
// colspan: row 1 merges each exercise's Load+%-Change pair into one
// wide cell showing just the exercise name once (not repeated per
// column); row 2 carries the actual "Load (kg)"/"% Change" sub-labels
// under that merged cell, and stays blank under ungrouped columns
// (Athlete, TTL Total, Completion) whose one real label already sits
// in row 1. Both rows are built from the same flat `columns` list
// used for the data rows, so header and data columns can never drift
// out of alignment with each other.
function buildHeaderRows(columns: MatrixColumn[]): { row1: { key: string; text: string; width: number }[]; row2: { key: string; text: string; width: number }[] } {
  const row1: { key: string; text: string; width: number }[] = [];
  const row2: { key: string; text: string; width: number }[] = [];
  let i = 0;
  while (i < columns.length) {
    const col = columns[i];
    if (col.group) {
      let width = 0;
      let j = i;
      while (j < columns.length && columns[j].group === col.group) {
        row2.push({ key: `${columns[j].group}-${columns[j].label}`, text: columns[j].label.toUpperCase(), width: columns[j].width });
        width += columns[j].width;
        j++;
      }
      row1.push({ key: col.group, text: col.group.toUpperCase(), width });
      i = j;
    } else {
      row1.push({ key: col.label, text: col.label.toUpperCase(), width: col.width });
      row2.push({ key: `${col.label}-blank`, text: "", width: col.width });
      i++;
    }
  }
  return { row1, row2 };
}

function MatrixSheet({
  title,
  groupName,
  generated,
  rangeLabel,
  athleteCount,
  columns,
  rows,
  pageLabel,
  branding,
}: {
  title: string;
  groupName: string;
  generated: string;
  rangeLabel: string;
  athleteCount: number;
  columns: MatrixColumn[];
  rows: SquadMatrixRow[];
  pageLabel?: string;
  branding: ResolvedBranding;
}) {
  const headerRows = buildHeaderRows(columns);
  return (
    <Page size="A4" orientation="landscape" style={s.page} wrap>
      <View style={s.brandRow}>
        <BrandHeader branding={branding} />
        <Text style={[s.titleLine, { marginTop: 0 }]}>{groupName} · {title}{pageLabel ? ` (${pageLabel})` : ""}</Text>
      </View>
      <Text style={s.metaLine}>Generated {generated} · {rangeLabel} · {athleteCount} athlete{athleteCount === 1 ? "" : "s"}</Text>

      <View style={s.matrixHeaderRow} fixed>
        {headerRows.row1.map((c) => (
          <Text key={c.key} style={[s.matrixHeaderCell, { flex: c.width }]}>{c.text}</Text>
        ))}
      </View>
      <View style={[s.matrixHeaderRow, { marginTop: 0 }]} fixed>
        {headerRows.row2.map((c) => (
          <Text key={c.key} style={[s.matrixHeaderCellSub, { flex: c.width }]}>{c.text}</Text>
        ))}
      </View>
      {rows.map((r) => (
        <View key={r.athleteId} style={s.matrixRow} wrap={false}>
          {columns.map((c, i) => {
            const cell = c.get(r);
            return (
              <Text key={c.label} style={[i === 0 ? s.matrixNameCell : s.matrixCell, { flex: c.width, color: cell.color ?? C.text }]}>
                {cell.text}
              </Text>
            );
          })}
        </View>
      ))}
    </Page>
  );
}

function StandingBoard({ title, rows, unit, decimals = 0 }: { title: string; rows: SquadStandingRow[]; unit: string; decimals?: number }) {
  return (
    <View style={s.board}>
      <Text style={s.boardTitle}>{title.toUpperCase()}</Text>
      {rows.length === 0 ? (
        <Text style={s.empty}>No data in this range.</Text>
      ) : (
        rows.map((r, i) => (
          <View key={r.athleteId} style={s.row}>
            <Text style={s.rank}>{i + 1}</Text>
            <Text style={s.name}>
              {r.athleteName}
              {r.exerciseName && <Text style={s.sub}>{"\n" + r.exerciseName}</Text>}
            </Text>
            <Text style={s.value}>{r.value.toFixed(decimals)}{unit}</Text>
          </View>
        ))
      )}
    </View>
  );
}

function ImprovedBoard({ title, rows }: { title: string; rows: SquadImprovedRow[] }) {
  return (
    <View style={s.board}>
      <Text style={s.boardTitle}>{title.toUpperCase()}</Text>
      {rows.length === 0 ? (
        <Text style={s.empty}>No data in this range.</Text>
      ) : (
        rows.map((r, i) => (
          <View key={r.athleteId} style={s.row}>
            <Text style={s.rank}>{i + 1}</Text>
            <Text style={s.name}>
              {r.athleteName}
              <Text style={s.sub}>{"\n" + r.exerciseName}</Text>
            </Text>
            <Text style={{ ...s.value, color: pctColor(r.pct) }}>{fmtPct(r.pct)}</Text>
          </View>
        ))
      )}
    </View>
  );
}

function CompletionBoard({ title, rows }: { title: string; rows: SquadCompletionRow[] }) {
  return (
    <View style={s.board}>
      <Text style={s.boardTitle}>{title.toUpperCase()}</Text>
      {rows.length === 0 ? (
        <Text style={s.empty}>No data in this range.</Text>
      ) : (
        rows.map((r, i) => (
          <View key={r.athleteId} style={s.row}>
            <Text style={s.rank}>{i + 1}</Text>
            <Text style={s.name}>
              {r.athleteName}
              <Text style={s.sub}>{`\n${r.completedSessions}/${r.totalSessions} sessions`}</Text>
            </Text>
            <Text style={s.value}>{r.pct.toFixed(0)}%</Text>
          </View>
        ))
      )}
    </View>
  );
}

// One or more landscape pages per athlete (8 exercises per page, via
// chunkExercises) - the exercise list comes from
// computeAthleteTrendExercises (lib/squad-report.ts): either the
// coach's explicit exercise picks or this athlete's own tonnage-
// ordered list, compounds first. Each exercise contributes a tonnage
// chart, an e1RM chart, or both, per the trendTonnage/trendE1rm
// toggles. Pages (and exercises within them) with nothing to plot are
// dropped entirely rather than rendering an empty page.
function AthleteTrendPage({
  athlete,
  exerciseOverride,
  limitTo8,
  trendTonnage,
  trendE1rm,
  branding,
}: {
  athlete: SquadAthleteInput;
  exerciseOverride: string[];
  limitTo8: boolean;
  trendTonnage: boolean;
  trendE1rm: boolean;
  branding: ResolvedBranding;
}) {
  const ordered = computeAthleteTrendExercises(athlete.data, exerciseOverride);
  const chunks = chunkExercises(ordered, limitTo8);

  const pages = chunks
    .map((chunk) => {
      const charts: { key: string; title: string; points: { date: string; value: number }[] }[] = [];
      for (const name of chunk) {
        if (trendTonnage) {
          const points = (athlete.data.weeklyExMap[name] ?? []).map((w) => ({ date: w.weekStart, value: w.ttl }));
          if (points.length >= 2) charts.push({ key: `${name}-ttl`, title: `${name} · Tonnage`, points });
        }
        if (trendE1rm) {
          const match = Object.keys(athlete.data.strength.exMap).find((n) => n.toLowerCase() === name.toLowerCase());
          if (match) {
            const points = (athlete.data.strength.weeklyExMap[match] ?? []).map((w) => ({ date: w.weekStart, value: w.e1rm }));
            if (points.length >= 2) charts.push({ key: `${name}-e1rm`, title: `${name} · e1RM`, points });
          }
        }
      }
      return charts;
    })
    .filter((charts) => charts.length > 0);

  if (pages.length === 0) return null;

  return (
    <>
      {pages.map((charts, pageIdx) => (
        <Page key={pageIdx} size="A4" orientation="landscape" style={s.page} wrap>
          <View style={s.brandRow}>
            <BrandHeader branding={branding} />
            <Text style={[s.titleLine, { marginTop: 0 }]}>
              {athlete.athleteName} · Exercise Trends{pages.length > 1 ? ` (${pageIdx + 1}/${pages.length})` : ""}
            </Text>
          </View>
          {/* 4 per row (landscape usable width 778pt, trendCell padding
              16pt + trendGrid gap 12pt accounted for) - Tonnage and e1RM
              are pushed consecutively per exercise above, so 4-per-row
              naturally pairs each exercise's two charts side by side. */}
          <View style={s.trendGrid}>
            {charts.map((c) => (
              <View key={c.key} style={s.trendCell} wrap={false}>
                <LineChart
                  series={[{ name: c.title, points: c.points }]}
                  unit="kg"
                  width={165}
                  height={105}
                  showLegend={false}
                  title={c.title.toUpperCase()}
                  titleStyle={s.trendChartTitle}
                />
              </View>
            ))}
          </View>
        </Page>
      ))}
    </>
  );
}

export default function SquadReportPdf({
  groupName,
  athleteCount,
  rangeLabel,
  generated,
  report,
  ttl,
  e1rm,
  powerSpeed,
  cardioHyrox,
  completion,
  exerciseBoards,
  powerSpeedBoards,
  cardioHyroxBoards,
  matrixRows,
  trendAthletes,
  trendExerciseOverride,
  limitTo8,
  trendTonnage,
  trendE1rm,
  bodyweightRelative,
  branding = DEFAULT_BRANDING,
}: {
  groupName: string;
  athleteCount: number;
  rangeLabel: string;
  generated: string;
  report: SquadReport;
  ttl: boolean;
  e1rm: boolean;
  powerSpeed: boolean;
  cardioHyrox: boolean;
  completion: boolean;
  exerciseBoards: { name: string; rows: SquadStandingRow[] }[];
  powerSpeedBoards: { name: string; rows: SquadStandingRow[]; unit: string; direction: "lower" | "higher" }[];
  cardioHyroxBoards: { id: string; title: string; rows: SquadStandingRow[]; unit: string; direction: "lower" | "higher"; decimals: number }[];
  matrixRows: SquadMatrixRow[];
  trendAthletes: SquadAthleteInput[];
  trendExerciseOverride: string[];
  // "Include 8 exercises by default" (true) vs "include all" (false,
  // paginated 8-per-sheet via chunkExercises) - shared by the Squad
  // Overview TTL/e1RM sheets and the per-athlete trend pages, since
  // it's the same underlying question everywhere: how many exercises
  // to spread across the report.
  limitTo8: boolean;
  trendTonnage: boolean;
  trendE1rm: boolean;
  bodyweightRelative: boolean;
  branding?: ResolvedBranding;
}) {
  const matrixExercises = exerciseBoards.map((b) => b.name);
  const ttlExerciseChunks = chunkExercises(matrixExercises, limitTo8);
  const e1rmExerciseChunks = matrixExercises.length > 0 ? chunkExercises(matrixExercises, limitTo8) : [];

  return (
    <Document title={`${groupName} - Squad Report`}>
      <Page size="A4" style={s.page} wrap>
        <View style={s.brandRow}>
          <BrandHeader branding={branding} />
          <Text style={[s.titleLine, { marginTop: 0 }]}>{groupName} · Squad Report</Text>
        </View>
        <Text style={s.metaLine}>Generated {generated} · {rangeLabel} · {athleteCount} athlete{athleteCount === 1 ? "" : "s"}</Text>

        {ttl && (
          <View style={s.metricRow} wrap={false}>
            <StandingBoard title="TTL · Current standing" rows={report.ttlStanding} unit=" kg" />
            <ImprovedBoard title="TTL · Most improved" rows={report.ttlImproved} />
          </View>
        )}

        {e1rm && (
          <View style={s.metricRow}>
            <ImprovedBoard title="e1RM · Most improved" rows={report.e1rmImproved} />
            {exerciseBoards.map(({ name, rows }) => (
              <StandingBoard
                key={name}
                title={`e1RM · ${name}`}
                rows={rows}
                unit={bodyweightRelative ? "×BW" : " kg"}
                decimals={bodyweightRelative ? 2 : 1}
              />
            ))}
          </View>
        )}

        {powerSpeed && powerSpeedBoards.length > 0 && (
          <View style={s.metricRow}>
            {powerSpeedBoards.map(({ name, rows, unit, direction }) => (
              <StandingBoard
                key={name}
                title={`${name} (${direction === "lower" ? "lower better" : "higher better"})`}
                rows={rows}
                unit={unit}
                decimals={unit === "s" ? 2 : 1}
              />
            ))}
          </View>
        )}

        {cardioHyrox && cardioHyroxBoards.length > 0 && (
          <View style={s.metricRow}>
            {cardioHyroxBoards.map(({ id, title, rows, unit, direction, decimals }) => (
              <StandingBoard
                key={id}
                title={`${title} (${direction === "lower" ? "lower better" : "higher better"})`}
                rows={rows}
                unit={unit ? ` ${unit}` : ""}
                decimals={decimals}
              />
            ))}
          </View>
        )}

        {completion && (
          <View style={s.metricRow} wrap={false}>
            <CompletionBoard title="Session completion · Top 5" rows={report.completionTop} />
            <CompletionBoard title="To watch · Lowest completion" rows={report.completionWatch} />
          </View>
        )}
      </Page>

      {ttl &&
        matrixRows.length > 0 &&
        ttlExerciseChunks.map((chunk, i) => (
          <MatrixSheet
            key={`ttl-${i}`}
            title="Squad Overview · TTL"
            groupName={groupName}
            generated={generated}
            rangeLabel={rangeLabel}
            athleteCount={athleteCount}
            columns={buildTtlColumns(chunk, completion)}
            rows={matrixRows}
            pageLabel={ttlExerciseChunks.length > 1 ? `${i + 1}/${ttlExerciseChunks.length}` : undefined}
            branding={branding}
          />
        ))}

      {e1rm &&
        matrixRows.length > 0 &&
        e1rmExerciseChunks.map((chunk, i) => (
          <MatrixSheet
            key={`e1rm-${i}`}
            title="Squad Overview · e1RM"
            groupName={groupName}
            generated={generated}
            rangeLabel={rangeLabel}
            athleteCount={athleteCount}
            columns={buildE1rmColumns(chunk, completion, bodyweightRelative)}
            rows={matrixRows}
            pageLabel={e1rmExerciseChunks.length > 1 ? `${i + 1}/${e1rmExerciseChunks.length}` : undefined}
            branding={branding}
          />
        ))}

      {(trendTonnage || trendE1rm) &&
        trendAthletes.map((athlete) => (
          <AthleteTrendPage
            key={athlete.athleteId}
            athlete={athlete}
            exerciseOverride={trendExerciseOverride}
            limitTo8={limitTo8}
            trendTonnage={trendTonnage}
            trendE1rm={trendE1rm}
            branding={branding}
          />
        ))}
    </Document>
  );
}

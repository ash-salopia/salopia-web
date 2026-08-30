"use client";

// Shared Hyrox/Cardio structure-display + metric-logging UI, used by
// both HyroxCardioAthleteView (athlete app) and Live Group's inline
// squad view - one place for all 9 sub-type branches rather than
// duplicating them per surface. Callers own persistence: pass an
// onPatch that merges into hyrox_config/cardio_config and saves it
// however fits that surface (offline-safe retry queue for the athlete
// app, a direct update for the coach's own live connection).

import { MetricBoxes } from "@/components/MetricBoxes";
import type { MetricKey, MetricValues } from "@/lib/cardio-metrics";
import type { Session } from "@/types";
import { zoneSummary, type ComputedZone } from "@/lib/training-zones";

// Prescribed training-zone targets for the athlete — Z chip + their
// computed HR / pace band, live from their aerobic profile. Reads
// cfg.zone (continuous / cardioIntervals / hyrox interval),
// block.zone (threshold), or cfg.underZone / cfg.overZone (over-unders).
function ZoneTargets({ cfg, subType, isHyrox, zones }: {
  cfg: any; subType: string; isHyrox: boolean; zones?: ComputedZone[] | null;
}) {
  const rows: { label: string; n: number }[] = [];
  if (!isHyrox && subType === "threshold") {
    (cfg.blocks ?? []).forEach((b: any, i: number) => {
      if (b?.zone != null) rows.push({ label: b.label || `Block ${i + 1}`, n: b.zone });
    });
  } else if (!isHyrox && subType === "overUnder") {
    if (cfg.underZone != null) rows.push({ label: "Under", n: cfg.underZone });
    if (cfg.overZone != null) rows.push({ label: "Over", n: cfg.overZone });
  } else if (cfg.zone != null) {
    rows.push({ label: "Target", n: cfg.zone });
  }
  if (!rows.length) return null;

  return (
    <div style={styles.section}>
      <div style={styles.sectionLabel}>Target zone{rows.length > 1 ? "s" : ""}</div>
      {rows.map((r, i) => {
        const cz = zones && r.n >= 1 && r.n <= 5 ? zones[r.n - 1] : null;
        const detail = cz && (cz.hr || cz.pace)
          ? zoneSummary(cz).replace(/^Z\d+\s+/, "")
          : "ask your coach to set your Max HR / MAS";
        return (
          <div key={i} style={styles.zoneRow}>
            {rows.length > 1 && <span style={styles.zoneRowLabel}>{r.label}</span>}
            <span style={styles.zoneChip}>Z{r.n}{cz ? ` ${cz.name}` : ""}</span>
            <span style={styles.zoneDetail}>{detail}</span>
          </div>
        );
      })}
    </div>
  );
}

export const HYROX_LABEL: Record<string, string> = {
  fixed: "Fixed Workout", cycling: "Cycling Intervals", emom: "EMOM",
  interval: "Intervals", circuit: "Circuit / AMRAP",
};
export const CARDIO_LABEL: Record<string, string> = {
  continuous: "Continuous / LSD", threshold: "Threshold / Tempo",
  cardioIntervals: "Intervals / VO2max", overUnder: "Over-Unders",
};

export default function HyroxCardioLog({
  session,
  onPatch,
  compact = false,
  zones,
  zonesEnabled = true,
}: {
  session: Session;
  onPatch: (patch: object) => void;
  compact?: boolean;
  zones?: ComputedZone[] | null;
  zonesEnabled?: boolean;
}) {
  const isHyrox = session.type === "hyrox";
  const subType = isHyrox ? (session.hyrox_type ?? "") : ((session as any).cardio_type ?? "");
  const cfg: any = (isHyrox ? session.hyrox_config : (session as any).cardio_config) ?? {};
  const tracked: MetricKey[] = cfg.tracked_metrics ?? [];

  // Fixed/Cycling/Circuit can have metrics turned on per-exercise, and
  // Threshold per-block, with nothing ticked at the session level - the
  // "Log result" section still needs to show in that case.
  const perItemList: any[] =
    isHyrox && subType === "fixed" ? (cfg.steps ?? [])
    : isHyrox && (subType === "cycling" || subType === "circuit") ? (cfg.exercises ?? [])
    : !isHyrox && subType === "threshold" ? (cfg.blocks ?? [])
    : [];
  const hasAnyMetrics = tracked.length > 0 || perItemList.some((it) => (it.tracked_metrics ?? []).length > 0);

  // Whole-session result (e.g. avg HR, calories) - always shown under
  // its own "Session avg/total" header so it reads as a distinct thing
  // from any per-exercise/per-round/per-cycle boxes above it, not just
  // more boxes in the same list.
  const singleMetrics = tracked.length > 0 ? (
    <div style={styles.subSection}>
      <div style={styles.sectionLabel}>Session avg/total</div>
      <MetricBoxes tracked={tracked} values={cfg.metrics ?? {}} onChange={(v) => onPatch({ metrics: v })} size={compact ? "compact" : "normal"} defaultDistanceUnit={cfg.default_distance_unit ?? "km"} />
    </div>
  ) : null;

  // One MetricBoxes per exercise (Cycling/Circuit's `exercises[]`, or
  // Fixed's `steps[]`) - e.g. Row: 560m, Wall Balls: 17 reps - each using
  // that exercise's own tracked_metrics (defaulted from its library entry,
  // see HyroxCardioBuilder), separate from the session-level box below it.
  const perExerciseMetrics = (items: any[], patchKey: "exercises" | "steps") => (
    <>
      {items.map((item, i) => {
        const itemTracked: MetricKey[] = item.tracked_metrics ?? [];
        if (!itemTracked.length) return null;
        return (
          <div key={i} style={styles.item}>
            <div style={styles.itemLabel}>{item.exercise || `Exercise ${i + 1}`}</div>
            <MetricBoxes
              tracked={itemTracked}
              values={item.metrics ?? {}}
              onChange={(v) => {
                const next = items.map((x, j) => j === i ? { ...x, metrics: v } : x);
                onPatch({ [patchKey]: next });
              }}
              size="compact"
              defaultDistanceUnit={item.default_distance_unit ?? "km"}
            />
          </div>
        );
      })}
    </>
  );

  // One MetricBoxes row for a single exercise at a single point in
  // `valuesArr` - shared by both the round-level and cycle-level
  // renderers below so the actual box + save logic exists in one place.
  const levelExerciseRow = (
    items: any[], i: number, item: any, metricsKey: "metrics" | "cycleMetrics", valuesArr: MetricValues[], idx: number, patchKey: "exercises"
  ) => {
    const itemTracked: MetricKey[] = item.tracked_metrics ?? [];
    if (!itemTracked.length) return null;
    return (
      <div key={i} style={styles.item}>
        <div style={styles.itemLabel}>{item.exercise || `Exercise ${i + 1}`}</div>
        <MetricBoxes
          tracked={itemTracked}
          values={valuesArr[idx] ?? {}}
          onChange={(v) => {
            const next = [...valuesArr];
            next[idx] = v;
            onPatch({ [patchKey]: items.map((x, j) => j === i ? { ...x, [metricsKey]: next } : x) });
          }}
          size="compact"
          defaultDistanceUnit={item.default_distance_unit ?? "km"}
        />
      </div>
    );
  };

  // Cycling/Circuit(rounds mode): exercises cycle in order for `rounds`
  // reps, so what actually happened is one result per (round, exercise)
  // pair - e.g. Round 1: Row 560m, Wall Balls 17 · Round 2: Row 540m,
  // Wall Balls 15 - not one flat box per exercise for the whole session.
  // Cycling additionally repeats that whole rounds block for `cycles`
  // (separated by rest), so a session with 3 cycles needs 3 full sets of
  // round boxes, not just one - grouped by cycle, then by round within
  // it, matching cycling order. `record_levels` (one session-level
  // tickbox pair, "Round/Cycle Data Tracking" in the builder) decides
  // whether round boxes, cycle-rollup boxes, both, or neither show
  // (0071/0072).
  const perLevelExerciseMetrics = (
    items: any[], rounds: number, cycles: number, level: "round" | "cycle", patchKey: "exercises"
  ) => {
    const eligible = items.some((it) => (it.tracked_metrics ?? []).length > 0);
    if (!eligible) return null;

    if (level === "cycle") {
      return (
        <>
          {Array.from({ length: cycles }, (_, c) => (
            <div key={c} style={{ marginBottom: 10 }}>
              <div style={styles.roundLabel}>Cycle {c + 1}</div>
              {items.map((item, i) => {
                const cycleValues: MetricValues[] = Array.isArray(item.cycleMetrics) ? item.cycleMetrics : [];
                return levelExerciseRow(items, i, item, "cycleMetrics", cycleValues, c, patchKey);
              })}
            </div>
          ))}
        </>
      );
    }

    // Round level: nest under a "Cycle N" header only when there's more
    // than one cycle to disambiguate - Circuit rounds mode never has a
    // cycles concept at all (always called with cycles=1), so it stays a
    // flat round list exactly as before.
    const showCycles = cycles > 1;
    return (
      <>
        {Array.from({ length: cycles }, (_, c) => (
          <div key={c} style={{ marginBottom: showCycles ? 14 : 0 }}>
            {showCycles && <div style={styles.cycleLabel}>Cycle {c + 1}</div>}
            {Array.from({ length: rounds }, (_, r) => {
              const flatIdx = c * rounds + r;
              return (
                <div key={r} style={{ marginBottom: 10, marginLeft: showCycles ? 12 : 0 }}>
                  <div style={styles.roundLabel}>Round {r + 1}</div>
                  {items.map((item, i) => {
                    const roundValues: MetricValues[] = Array.isArray(item.metrics) ? item.metrics : [];
                    return levelExerciseRow(items, i, item, "metrics", roundValues, flatIdx, patchKey);
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </>
    );
  };

  const arrayMetrics = (count: number) => {
    const arr: MetricValues[] = cfg.metrics ?? [];
    return Array.from({ length: count }, (_, i) => (
      <div key={i} style={styles.item}>
        <div style={styles.itemLabel}>{isHyrox ? "Set" : "Rep"} {i + 1}</div>
        <MetricBoxes
          tracked={tracked}
          values={arr[i] ?? {}}
          onChange={(v) => { const next = [...arr]; next[i] = v; onPatch({ metrics: next }); }}
          size="compact"
          defaultDistanceUnit={cfg.default_distance_unit ?? "km"}
        />
      </div>
    ));
  };

  let structure: React.ReactNode = null;
  let logging: React.ReactNode = singleMetrics;

  if (isHyrox && subType === "fixed") {
    const steps: any[] = cfg.steps ?? [];
    structure = steps.map((st, i) => (
      <div key={i} style={styles.item}>
        <div style={styles.itemLabel}>{i + 1}. {st.exercise || "-"} {st.target ? `· ${st.target}` : ""}</div>
        <MetricBoxes tracked={st.tracked_metrics ?? tracked} values={st.metrics ?? {}} onChange={(v) => {
          const next = steps.map((s, j) => j === i ? { ...s, metrics: v } : s);
          onPatch({ steps: next });
        }} size="compact" defaultDistanceUnit={st.default_distance_unit ?? "km"} />
      </div>
    ));
    logging = singleMetrics;
  } else if (isHyrox && subType === "cycling") {
    const exercises: any[] = cfg.exercises ?? [];
    structure = (
      <div style={styles.summary}>
        {exercises.map((e, i) => <div key={i}>{e.exercise}{e.reps ? ` · ${e.reps}` : ""}</div>)}
        <div style={styles.summaryMeta}>{cfg.workSec ?? 40}s on / {cfg.restSec ?? 20}s rest · {cfg.rounds ?? 2} rounds × {cfg.cycles ?? 3} cycles</div>
      </div>
    );
    {
      const cyclingLevels: ("round" | "cycle")[] = cfg.record_levels ?? ["round"];
      const rounds = cfg.rounds ?? 2;
      const cycles = cfg.cycles ?? 3;
      logging = (
        <>
          {(cyclingLevels.includes("round") || cyclingLevels.includes("cycle")) && (
            <div style={styles.subSection}>
              <div style={styles.sectionLabel}>Round/Cycle Data Tracking</div>
              {cyclingLevels.includes("round") && perLevelExerciseMetrics(exercises, rounds, cycles, "round", "exercises")}
              {cyclingLevels.includes("cycle") && perLevelExerciseMetrics(exercises, rounds, cycles, "cycle", "exercises")}
            </div>
          )}
          {singleMetrics}
        </>
      );
    }
  } else if (isHyrox && subType === "emom") {
    const slots: any[] = cfg.slots ?? [];
    structure = (
      <div style={styles.summary}>
        <div style={styles.summaryMeta}>{cfg.mins ?? 10} minutes</div>
        {slots.map((sl, i) => <div key={i}>{sl.minute}: {sl.exercise} × {sl.reps}</div>)}
      </div>
    );
  } else if (isHyrox && subType === "interval") {
    structure = (
      <div style={styles.summary}>
        {cfg.exercise || "-"} {cfg.load ? `@ ${cfg.load}` : ""}
        <div style={styles.summaryMeta}>{cfg.workSec ?? 120}s work / {cfg.restSec ?? 90}s rest</div>
      </div>
    );
    logging = <>{arrayMetrics(cfg.sets ?? 6)}</>;
  } else if (isHyrox && subType === "circuit") {
    const exercises: any[] = cfg.exercises ?? [];
    const isAmrap = !!cfg.isAmrap;
    const rounds = cfg.rounds ?? 4;
    structure = (
      <div style={styles.summary}>
        {exercises.map((e, i) => <div key={i}>{e.exercise} × {e.reps}</div>)}
        <div style={styles.summaryMeta}>{isAmrap ? `AMRAP, ${cfg.timeCap ?? "-"}s cap` : `${rounds} rounds`}</div>
        {!isAmrap && (
          <div style={styles.roundRow}>
            {Array.from({ length: rounds }, (_, i) => {
              const done = (cfg.roundsDone ?? [])[i] ?? false;
              return (
                <button key={i} style={{ ...styles.roundChip, ...(done ? styles.roundChipOn : {}) }}
                  onClick={() => { const r = [...(cfg.roundsDone ?? Array(rounds).fill(false))]; r[i] = !r[i]; onPatch({ roundsDone: r }); }}>
                  {i + 1}{done ? " ✓" : ""}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
    logging = isAmrap
      ? <>{perExerciseMetrics(exercises, "exercises")}{singleMetrics}</>
      : <>{perLevelExerciseMetrics(exercises, rounds, 1, "round", "exercises")}{singleMetrics}</>;
  } else if (!isHyrox && subType === "continuous") {
    structure = (
      <div style={styles.summary}>
        {cfg.modality || "-"} {cfg.duration ? `· ${cfg.duration}min` : ""} {cfg.distance ? `· ${cfg.distance}` : ""}
        {cfg.intensity && <div style={styles.summaryMeta}>{cfg.intensity}</div>}
        {cfg.notes && <div style={styles.summaryMeta}>{cfg.notes}</div>}
      </div>
    );
  } else if (!isHyrox && subType === "threshold") {
    const blocks: any[] = cfg.blocks ?? [];
    structure = blocks.map((b, i) => (
      <div key={i} style={styles.item}>
        <div style={styles.itemLabel}>
          {b.label}{b.modality ? ` (${b.modality})` : ""} · {(b.repeat ?? 1)}× {b.duration}min {b.intensity ? `@ ${b.intensity}` : ""}
        </div>
        <MetricBoxes tracked={b.tracked_metrics ?? tracked} values={b.metrics ?? {}} onChange={(v) => {
          const next = blocks.map((x, j) => j === i ? { ...x, metrics: v } : x);
          onPatch({ blocks: next });
        }} size="compact" defaultDistanceUnit={b.default_distance_unit ?? cfg.default_distance_unit ?? "km"} />
      </div>
    ));
    logging = null;
  } else if (!isHyrox && subType === "cardioIntervals") {
    structure = (
      <div style={styles.summary}>
        {cfg.modality || "-"} {cfg.workDur ? `· ${cfg.workDur}s work` : ""} {cfg.restDur ? `· ${cfg.restDur}s rest` : ""}
        {cfg.intensity && <div style={styles.summaryMeta}>{cfg.intensity}</div>}
      </div>
    );
    logging = <>{arrayMetrics(cfg.reps ?? 6)}</>;
  } else if (!isHyrox && subType === "overUnder") {
    structure = (
      <div style={styles.summary}>
        {cfg.modality || "-"} · {cfg.sets ?? 3} sets × {cfg.reps ?? 6}
        <div style={styles.summaryMeta}>Under: {cfg.underDur}s @ {cfg.underInt} · Over: {cfg.overDur}s @ {cfg.overInt}</div>
      </div>
    );
    logging = <>{arrayMetrics(cfg.sets ?? 3)}</>;
  }

  return (
    <>
      {zonesEnabled && <ZoneTargets cfg={cfg} subType={subType} isHyrox={isHyrox} zones={zones} />}
      {structure && <div style={styles.section}>{structure}</div>}
      {hasAnyMetrics ? (
        <div style={styles.section}>
          <div style={styles.sectionLabel}>Log result</div>
          {logging}
        </div>
      ) : (
        <div style={styles.emptyNote}>No metrics turned on for this session yet - edit it to add some.</div>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginBottom: 12 },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 10 },
  summary: { fontSize: 14, color: "var(--text)", lineHeight: 1.6 },
  summaryMeta: { fontSize: 12, color: "var(--mute)", marginTop: 4 },
  item: { marginBottom: 12 },
  itemLabel: { fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 6 },
  roundLabel: { fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 6 },
  cycleLabel: { fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 6 },
  subSection: { marginBottom: 14 },
  roundRow: { display: "flex", flexWrap: "wrap" as const, gap: 6, marginTop: 8 },
  roundChip: { background: "var(--panel2)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 7, padding: "6px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  roundChipOn: { background: "var(--good-dim)", borderColor: "var(--good)", color: "var(--good)" },
  emptyNote: { fontSize: 13, color: "var(--mute)", fontStyle: "italic", padding: "12px 0" },
  zoneRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const, marginTop: 6 },
  zoneRowLabel: { fontSize: 11, fontWeight: 700, color: "var(--mute)", minWidth: 44 },
  zoneChip: { fontSize: 11, fontWeight: 700, color: "var(--accent)", background: "var(--accent-dim)", borderRadius: 6, padding: "3px 9px" },
  zoneDetail: { fontSize: 13, color: "var(--text)" },
};

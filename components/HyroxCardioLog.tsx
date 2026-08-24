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
}: {
  session: Session;
  onPatch: (patch: object) => void;
  compact?: boolean;
}) {
  const isHyrox = session.type === "hyrox";
  const subType = isHyrox ? (session.hyrox_type ?? "") : ((session as any).cardio_type ?? "");
  const cfg: any = (isHyrox ? session.hyrox_config : (session as any).cardio_config) ?? {};
  const tracked: MetricKey[] = cfg.tracked_metrics ?? [];

  const singleMetrics = (
    <MetricBoxes tracked={tracked} values={cfg.metrics ?? {}} onChange={(v) => onPatch({ metrics: v })} size={compact ? "compact" : "normal"} />
  );

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
        <MetricBoxes tracked={tracked} values={st.metrics ?? {}} onChange={(v) => {
          const next = steps.map((s, j) => j === i ? { ...s, metrics: v } : s);
          onPatch({ steps: next });
        }} size="compact" />
      </div>
    ));
    logging = null;
  } else if (isHyrox && subType === "cycling") {
    const exercises: any[] = cfg.exercises ?? [];
    structure = (
      <div style={styles.summary}>
        {exercises.map((e, i) => <div key={i}>{e.exercise}{e.reps ? ` · ${e.reps}` : ""}</div>)}
        <div style={styles.summaryMeta}>{cfg.workSec ?? 40}s on / {cfg.restSec ?? 20}s rest · {cfg.rounds ?? 2} rounds × {cfg.cycles ?? 3} cycles</div>
      </div>
    );
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
  } else if (!isHyrox && subType === "continuous") {
    structure = (
      <div style={styles.summary}>
        {cfg.modality || "-"} {cfg.duration ? `· ${cfg.duration}` : ""} {cfg.distance ? `· ${cfg.distance}` : ""}
        {cfg.intensity && <div style={styles.summaryMeta}>{cfg.intensity}</div>}
        {cfg.notes && <div style={styles.summaryMeta}>{cfg.notes}</div>}
      </div>
    );
  } else if (!isHyrox && subType === "threshold") {
    const blocks: any[] = cfg.blocks ?? [];
    structure = blocks.map((b, i) => (
      <div key={i} style={styles.item}>
        <div style={styles.itemLabel}>{b.label} · {(b.repeat ?? 1)}× {b.duration} {b.intensity ? `@ ${b.intensity}` : ""}</div>
        <MetricBoxes tracked={tracked} values={b.metrics ?? {}} onChange={(v) => {
          const next = blocks.map((x, j) => j === i ? { ...x, metrics: v } : x);
          onPatch({ blocks: next });
        }} size="compact" />
      </div>
    ));
    logging = null;
  } else if (!isHyrox && subType === "cardioIntervals") {
    structure = (
      <div style={styles.summary}>
        {cfg.modality || "-"} {cfg.workDur ? `· ${cfg.workDur} work` : ""} {cfg.restDur ? `· ${cfg.restDur} rest` : ""}
        {cfg.intensity && <div style={styles.summaryMeta}>{cfg.intensity}</div>}
      </div>
    );
    logging = <>{arrayMetrics(cfg.reps ?? 6)}</>;
  } else if (!isHyrox && subType === "overUnder") {
    structure = (
      <div style={styles.summary}>
        {cfg.modality || "-"} · {cfg.sets ?? 3} sets × {cfg.reps ?? 6}
        <div style={styles.summaryMeta}>Under: {cfg.underDur} @ {cfg.underInt} · Over: {cfg.overDur} @ {cfg.overInt}</div>
      </div>
    );
    logging = <>{arrayMetrics(cfg.sets ?? 3)}</>;
  }

  return (
    <>
      {structure && <div style={styles.section}>{structure}</div>}
      {tracked.length > 0 ? (
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
  roundRow: { display: "flex", flexWrap: "wrap" as const, gap: 6, marginTop: 8 },
  roundChip: { background: "var(--panel2)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 7, padding: "6px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  roundChipOn: { background: "var(--good-dim)", borderColor: "var(--good)", color: "var(--good)" },
  emptyNote: { fontSize: 13, color: "var(--mute)", fontStyle: "italic", padding: "12px 0" },
};

"use client";

import { useEffect, useMemo, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import JSZip from "jszip";
import { todayISO, resolveDateRange, type ReportRangeMode } from "@/lib/date-utils";
import { DEFAULT_REPORT_OPTIONS, type ReportOptions } from "@/lib/report-options";
import { generateReport } from "@/lib/data/reports";
import { listAthletes } from "@/lib/data/athletes";
import { listReportPresets, saveReportPreset, deleteReportPreset, type ReportPreset } from "@/lib/data/report-presets";
import { getMyBranding } from "@/lib/data/branding";
import { DEFAULT_BRANDING, type ResolvedBranding } from "@/types/branding";
import type { Athlete } from "@/types";
import ReportTargetPicker from "@/components/reports/ReportTargetPicker";
import DateRangePicker from "@/components/reports/DateRangePicker";
import ReportOptionsForm from "@/components/reports/ReportOptionsForm";
import ExportModal from "@/components/ExportModal";
import AthleteReportPdf from "@/components/reports/pdf/AthleteReportPdf";
import SquadReportPdf from "@/components/reports/pdf/SquadReportPdf";
import {
  computeSquadReport,
  availableExercises,
  computeExerciseBoard,
  computeSquadMatrix,
  availablePowerSpeedExercises,
  computePowerSpeedBoard,
  availableCardioHyroxMetrics,
  computeCardioExerciseBoard,
  cardioMetricOptionId,
  type SquadReport,
  type SquadAthleteInput,
  type SquadStandingRow,
  type SquadImprovedRow,
  type SquadCompletionRow,
  type SquadCardioMetricOption,
} from "@/lib/squad-report";
import { METRIC_META } from "@/lib/cardio-metrics";

type Tab = "athletes" | "squad";

// Squad Report's config, for the squad preset row (see 0059) - a
// different shape from ReportOptions, sharing the same report_presets
// table/UI pattern via `kind`.
interface SquadPresetOptions {
  ttl: boolean;
  e1rm: boolean;
  powerSpeed: boolean;
  completion: boolean;
  bodyweightRelative: boolean;
  exercises: string[];
  powerSpeedExercises: string[];
  // 0089 — Cardio/Hyrox exercise board, stored as cardioMetricOptionId()
  // strings ("hyrox::distance::Row (Cycling Intervals)") rather than
  // SquadCardioMetricOption objects, matching how exercises/
  // powerSpeedExercises are already stored as plain name strings.
  cardioHyrox: boolean;
  cardioHyroxOptionIds: string[];
  trendTonnage: boolean;
  trendE1rm: boolean;
  limitTo8: boolean;
}

function Leaderboard({
  title,
  standing,
  improved,
  completion,
  unit = "",
  decimals = 0,
}: {
  title: string;
  standing?: SquadStandingRow[];
  improved?: SquadImprovedRow[];
  completion?: SquadCompletionRow[];
  unit?: string;
  decimals?: number;
}) {
  const rows = standing ?? improved ?? completion ?? [];
  return (
    <div style={s.card}>
      <div style={s.cardTitle}>{title}</div>
      {rows.length === 0 ? (
        <div style={s.emptyNote}>No data in this range.</div>
      ) : standing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {standing.map((r, i) => (
            <div key={r.athleteId} style={s.boardRowItem}>
              <span style={s.boardRank}>{i + 1}</span>
              <span style={s.boardName}>
                {r.athleteName}
                {r.exerciseName && <span style={s.boardSub}> · {r.exerciseName}</span>}
              </span>
              <span style={s.boardValue}>{r.value.toFixed(decimals)}{unit}</span>
            </div>
          ))}
        </div>
      ) : improved ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {improved.map((r, i) => (
            <div key={r.athleteId} style={s.boardRowItem}>
              <span style={s.boardRank}>{i + 1}</span>
              <span style={s.boardName}>
                {r.athleteName}
                <span style={s.boardSub}> · {r.exerciseName}</span>
              </span>
              <span style={{ ...s.boardValue, color: r.pct >= 0 ? "var(--good)" : "#ff7d7d" }}>
                {r.pct >= 0 ? "+" : ""}{r.pct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {completion!.map((r, i) => (
            <div key={r.athleteId} style={s.boardRowItem}>
              <span style={s.boardRank}>{i + 1}</span>
              <span style={s.boardName}>
                {r.athleteName}
                <span style={s.boardSub}> · {r.completedSessions}/{r.totalSessions} sessions</span>
              </span>
              <span style={s.boardValue}>{r.pct.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type AiSummary = { summary: string; themes: string } | null;

async function fetchAiSummary(
  athleteId: string,
  rangeStart: string | null,
  rangeEnd: string | null,
  options: ReportOptions
): Promise<AiSummary> {
  const res = await fetch("/api/training-report-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      athleteId,
      rangeStart,
      rangeEnd,
      includeTtl: options.ttl,
      includeE1rm: options.e1rm,
      includeNotes: options.athleteNotes,
      includeRpe: options.sessionRpe,
      includeTrainingLoad: options.trainingLoadTrend,
      includeCardio: options.cardioMetricsTrend,
      includeHyrox: options.hyroxMetricsTrend,
      includePowerSpeed: options.powerSpeedTrend,
      includeBarSpeed: options.barSpeedTrend,
      cardioMetricKeys: options.cardioMetricKeys,
      hyroxMetricKeys: options.hyroxMetricKeys,
      coachContext: options.coachContext,
    }),
  });
  if (!res.ok) return null;
  return res.json();
}

export default function ReportingPage() {
  const [tab, setTab] = useState<Tab>("athletes");

  // Athlete Reports tab state
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [mode, setMode] = useState<ReportRangeMode>("4w");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState(todayISO());
  const [options, setOptions] = useState<ReportOptions>(DEFAULT_REPORT_OPTIONS);
  // Gates whether the bulk PDF flow fires a separate AI-summary call per
  // athlete - kept distinct from options.aiSummary (which just controls
  // whether the AI box renders at all, same as the single-athlete report)
  // because bulk means N extra paid AI calls, one per selected athlete,
  // so it needs its own explicit opt-in rather than inheriting the
  // single-report default.
  const [includeBulkAi, setIncludeBulkAi] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // Report presets - saved ReportOptions selections, reusable across
  // future reporting sessions (org-scoped, see supabase/migrations/
  // 0057_report_presets.sql). Athlete Reports tab only - the squad
  // tab's TTL/e1RM toggles are a much smaller, separate config.
  const [presets, setPresets] = useState<ReportPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [presetSaving, setPresetSaving] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetError, setPresetError] = useState("");

  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  // Manual exercise tick-list for the TTL/e1RM line chart and the
  // Power/Speed trend section - same "leave empty to auto-select,
  // tick to override" pattern as the Squad Report's exercise picker.
  // Options are fetched on demand (👁 Load exercises) since, unlike
  // Squad, this tab has no pre-fetch step before Preview/Download.
  const [athleteExOptions, setAthleteExOptions] = useState<string[]>([]);
  const [athletePsOptions, setAthletePsOptions] = useState<string[]>([]);
  const [athleteExSearch, setAthleteExSearch] = useState("");
  const [athletePsSearch, setAthletePsSearch] = useState("");
  const [exerciseSelection, setExerciseSelection] = useState<string[]>([]);
  const [powerSpeedSelection, setPowerSpeedSelection] = useState<string[]>([]);
  const [exOptionsLoaded, setExOptionsLoaded] = useState(false);
  const [exOptionsLoading, setExOptionsLoading] = useState(false);
  const [exOptionsError, setExOptionsError] = useState("");

  // Squad Report tab state - kept separate from the Athlete Reports tab's
  // targetIds/options (a group selection and TTL/e1RM toggles specific to
  // leaderboards, not the full per-athlete report config) but shares the
  // same date range, since "what period is this reporting session for"
  // is one decision regardless of which tab is open.
  const [squadTargetIds, setSquadTargetIds] = useState<string[]>([]);
  const [squadGroupName, setSquadGroupName] = useState<string | null>(null);
  const [squadTtl, setSquadTtl] = useState(true);
  const [squadE1rm, setSquadE1rm] = useState(false);
  const [squadPowerSpeed, setSquadPowerSpeed] = useState(false);
  const [squadCompletion, setSquadCompletion] = useState(false);
  const [squadBodyweightRelative, setSquadBodyweightRelative] = useState(false);
  const [squadLoading, setSquadLoading] = useState(false);
  const [squadPdfLoading, setSquadPdfLoading] = useState(false);
  const [squadError, setSquadError] = useState("");
  const [squadReport, setSquadReport] = useState<SquadReport | null>(null);
  // Kept alongside squadReport so the exercise-specific boards
  // (computeExerciseBoard) can be recomputed instantly whenever the
  // coach ticks a different set of exercises, without re-fetching.
  const [squadAthleteReports, setSquadAthleteReports] = useState<SquadAthleteInput[] | null>(null);
  // Multiple exercises can be ticked at once - one "e1RM · Current
  // standing" board per exercise (e.g. Back Squat, Bench Press, Shoulder
  // Press all side by side), not just one at a time.
  const [squadExercises, setSquadExercises] = useState<string[]>([]);
  const [squadExerciseSearch, setSquadExerciseSearch] = useState("");
  // Power/Speed leaderboards - same "search + tick, one board per
  // tick" pattern as the e1RM boards above, kept as a separate list
  // since it's a different exercise pool (sprints/jumps, not lifts).
  const [squadPowerSpeedExercises, setSquadPowerSpeedExercises] = useState<string[]>([]);
  const [squadPowerSpeedSearch, setSquadPowerSpeedSearch] = useState("");
  // 0089 — Cardio/Hyrox exercise board, same "search + tick, one board
  // per tick" pattern as Power/Speed above. Ticked values are option
  // ids (cardioMetricOptionId), not just an exercise name, since the
  // same exercise name can legitimately appear under more than one
  // sub-type (see squad-report.ts's header comment on this board).
  const [squadCardioHyrox, setSquadCardioHyrox] = useState(false);
  const [squadCardioHyroxOptionIds, setSquadCardioHyroxOptionIds] = useState<string[]>([]);
  const [squadCardioHyroxSearch, setSquadCardioHyroxSearch] = useState("");
  // PDF-only options (see SquadReportPdf) - which trend metric(s) to
  // chart per exercise, and whether the Squad Overview sheets + trend
  // pages cap at 8 exercises or paginate through all of them.
  const [squadTrendTonnage, setSquadTrendTonnage] = useState(true);
  const [squadTrendE1rm, setSquadTrendE1rm] = useState(false);
  const [squadLimitTo8, setSquadLimitTo8] = useState(true);

  // Squad Report presets - same table/pattern as the Athlete Reports
  // presets above (see lib/data/report-presets.ts), kind="squad".
  const [squadPresets, setSquadPresets] = useState<ReportPreset<SquadPresetOptions>[]>([]);
  const [squadPresetName, setSquadPresetName] = useState("");
  const [squadPresetSaving, setSquadPresetSaving] = useState(false);
  const [selectedSquadPresetId, setSelectedSquadPresetId] = useState("");
  const [squadPresetError, setSquadPresetError] = useState("");

  // Org logo/colours (premium tier) - fetched once and passed to every
  // PDF, so a coach's branding shows up on reports the same way it
  // already does on the coach header and the public Home Programme
  // link. DEFAULT_BRANDING (plain "VIS BUILD" text) until this loads
  // or for orgs with no branding set.
  const [branding, setBranding] = useState<ResolvedBranding>(DEFAULT_BRANDING);

  useEffect(() => {
    listAthletes().then(setAthletes).catch(() => {});
    listReportPresets<ReportOptions>("athlete").then(setPresets).catch(() => {});
    listReportPresets<SquadPresetOptions>("squad").then(setSquadPresets).catch(() => {});
    getMyBranding().then(setBranding).catch(() => {});
  }, []);

  const athleteById = (id: string) => athletes.find((a) => a.id === id);

  const handleSavePreset = async () => {
    const name = presetName.trim();
    if (!name) return;
    setPresetError("");
    setPresetSaving(true);
    try {
      const saved = await saveReportPreset<ReportOptions>("athlete", name, options);
      setPresets((prev) => [...prev.filter((p) => p.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      setPresetName("");
      setSelectedPresetId(saved.id);
    } catch (e) {
      setPresetError(e instanceof Error ? e.message : "Could not save preset");
    } finally {
      setPresetSaving(false);
    }
  };

  const handleLoadPreset = (id: string) => {
    setSelectedPresetId(id);
    const preset = presets.find((p) => p.id === id);
    // Merge over the current defaults rather than trusting the saved
    // JSONB wholesale - a preset saved before a newer ReportOptions
    // field existed (e.g. cardioMetricKeys) would otherwise load with
    // that field undefined, and .includes() on it crashes the render.
    if (preset) setOptions({ ...DEFAULT_REPORT_OPTIONS, ...preset.options });
  };

  const handleDeletePreset = async (id: string) => {
    setPresetError("");
    try {
      await deleteReportPreset(id);
      setPresets((prev) => prev.filter((p) => p.id !== id));
      if (selectedPresetId === id) setSelectedPresetId("");
    } catch (e) {
      setPresetError(e instanceof Error ? e.message : "Could not delete preset");
    }
  };

  const handleSaveSquadPreset = async () => {
    const name = squadPresetName.trim();
    if (!name) return;
    setSquadPresetError("");
    setSquadPresetSaving(true);
    try {
      const squadOptions: SquadPresetOptions = {
        ttl: squadTtl,
        e1rm: squadE1rm,
        powerSpeed: squadPowerSpeed,
        completion: squadCompletion,
        bodyweightRelative: squadBodyweightRelative,
        exercises: squadExercises,
        powerSpeedExercises: squadPowerSpeedExercises,
        cardioHyrox: squadCardioHyrox,
        cardioHyroxOptionIds: squadCardioHyroxOptionIds,
        trendTonnage: squadTrendTonnage,
        trendE1rm: squadTrendE1rm,
        limitTo8: squadLimitTo8,
      };
      const saved = await saveReportPreset<SquadPresetOptions>("squad", name, squadOptions);
      setSquadPresets((prev) => [...prev.filter((p) => p.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      setSquadPresetName("");
      setSelectedSquadPresetId(saved.id);
    } catch (e) {
      setSquadPresetError(e instanceof Error ? e.message : "Could not save preset");
    } finally {
      setSquadPresetSaving(false);
    }
  };

  const handleLoadSquadPreset = (id: string) => {
    setSelectedSquadPresetId(id);
    const preset = squadPresets.find((p) => p.id === id);
    if (!preset) return;
    const o = preset.options;
    setSquadTtl(o.ttl);
    setSquadE1rm(o.e1rm);
    setSquadPowerSpeed(o.powerSpeed ?? false);
    setSquadCompletion(o.completion);
    setSquadBodyweightRelative(o.bodyweightRelative);
    setSquadExercises(o.exercises);
    setSquadPowerSpeedExercises(o.powerSpeedExercises ?? []);
    setSquadCardioHyrox(o.cardioHyrox ?? false);
    setSquadCardioHyroxOptionIds(o.cardioHyroxOptionIds ?? []);
    setSquadTrendTonnage(o.trendTonnage);
    setSquadTrendE1rm(o.trendE1rm);
    setSquadLimitTo8(o.limitTo8);
  };

  const handleDeleteSquadPreset = async (id: string) => {
    setSquadPresetError("");
    try {
      await deleteReportPreset(id);
      setSquadPresets((prev) => prev.filter((p) => p.id !== id));
      if (selectedSquadPresetId === id) setSelectedSquadPresetId("");
    } catch (e) {
      setSquadPresetError(e instanceof Error ? e.message : "Could not delete preset");
    }
  };

  const exerciseOptions = useMemo(() => (squadAthleteReports ? availableExercises(squadAthleteReports) : []), [squadAthleteReports]);
  const filteredExerciseOptions = useMemo(
    () => (squadExerciseSearch.trim() ? exerciseOptions.filter((n) => n.toLowerCase().includes(squadExerciseSearch.trim().toLowerCase())) : exerciseOptions),
    [exerciseOptions, squadExerciseSearch]
  );
  const exerciseBoards = useMemo(() => {
    if (!squadAthleteReports) return [];
    return squadExercises.map((name) => ({ name, rows: computeExerciseBoard(squadAthleteReports, name, squadBodyweightRelative) }));
  }, [squadAthleteReports, squadExercises, squadBodyweightRelative]);

  const powerSpeedExerciseOptions = useMemo(
    () => (squadAthleteReports ? availablePowerSpeedExercises(squadAthleteReports) : []),
    [squadAthleteReports]
  );
  const filteredPowerSpeedExerciseOptions = useMemo(
    () =>
      squadPowerSpeedSearch.trim()
        ? powerSpeedExerciseOptions.filter((n) => n.toLowerCase().includes(squadPowerSpeedSearch.trim().toLowerCase()))
        : powerSpeedExerciseOptions,
    [powerSpeedExerciseOptions, squadPowerSpeedSearch]
  );
  const powerSpeedBoards = useMemo(() => {
    if (!squadAthleteReports) return [];
    return squadPowerSpeedExercises
      .map((name) => {
        const board = computePowerSpeedBoard(squadAthleteReports, name);
        return board ? { name, rows: board.rows, unit: board.unit, direction: board.direction } : null;
      })
      .filter((b): b is { name: string; rows: SquadStandingRow[]; unit: string; direction: "lower" | "higher" } => b != null);
  }, [squadAthleteReports, squadPowerSpeedExercises]);

  const toggleSquadPowerSpeedExercise = (name: string) => {
    setSquadPowerSpeedExercises((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  };

  const cardioHyroxOptions = useMemo(
    () => (squadAthleteReports ? availableCardioHyroxMetrics(squadAthleteReports) : []),
    [squadAthleteReports]
  );
  const filteredCardioHyroxOptions = useMemo(() => {
    const q = squadCardioHyroxSearch.trim().toLowerCase();
    if (!q) return cardioHyroxOptions;
    return cardioHyroxOptions.filter((o) => `${o.sessionType} ${METRIC_META[o.key].label} ${o.group}`.toLowerCase().includes(q));
  }, [cardioHyroxOptions, squadCardioHyroxSearch]);
  const cardioHyroxBoards = useMemo(() => {
    if (!squadAthleteReports) return [];
    return squadCardioHyroxOptionIds
      .map((id) => {
        const option = cardioHyroxOptions.find((o) => cardioMetricOptionId(o) === id);
        if (!option) return null;
        const board = computeCardioExerciseBoard(squadAthleteReports, option);
        if (!board) return null;
        return {
          id,
          option,
          title: `${METRIC_META[option.key].label} — ${option.group}`,
          rows: board.rows,
          unit: board.unit,
          direction: board.direction,
          decimals: option.key === "reps" || option.key === "rounds" ? 0 : 1,
        };
      })
      .filter(
        (
          b
        ): b is {
          id: string;
          option: SquadCardioMetricOption;
          title: string;
          rows: SquadStandingRow[];
          unit: string;
          direction: "lower" | "higher";
          decimals: number;
        } => b != null
      );
  }, [squadAthleteReports, squadCardioHyroxOptionIds, cardioHyroxOptions]);

  const toggleSquadCardioHyroxOption = (id: string) => {
    setSquadCardioHyroxOptionIds((prev) => (prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]));
  };

  const toggleSquadExercise = (name: string) => {
    setSquadExercises((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  };

  const filteredAthleteExOptions = useMemo(
    () => (athleteExSearch.trim() ? athleteExOptions.filter((n) => n.toLowerCase().includes(athleteExSearch.trim().toLowerCase())) : athleteExOptions),
    [athleteExOptions, athleteExSearch]
  );
  const filteredAthletePsOptions = useMemo(
    () => (athletePsSearch.trim() ? athletePsOptions.filter((n) => n.toLowerCase().includes(athletePsSearch.trim().toLowerCase())) : athletePsOptions),
    [athletePsOptions, athletePsSearch]
  );
  const toggleExerciseSelection = (name: string) => {
    setExerciseSelection((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  };
  const togglePowerSpeedSelection = (name: string) => {
    setPowerSpeedSelection((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  };

  // Selected athletes/date range changed since the exercise list was
  // loaded - clear it rather than leave a picker showing exercises
  // that may no longer apply to who's actually selected now.
  useEffect(() => {
    setExOptionsLoaded(false);
    setAthleteExOptions([]);
    setAthletePsOptions([]);
    setExerciseSelection([]);
    setPowerSpeedSelection([]);
  }, [targetIds, mode, customStart, customEnd]);

  const handleLoadExerciseOptions = async () => {
    if (!targetIds.length) return;
    setExOptionsError("");
    setExOptionsLoading(true);
    try {
      const { start, end } = resolveDateRange(mode, customStart, customEnd);
      const exNames = new Set<string>();
      const psNames = new Set<string>();
      for (const id of targetIds) {
        const data = await generateReport(id, start, end);
        Object.keys(data.exMap).forEach((n) => exNames.add(n));
        Object.keys(data.strength.exMap).forEach((n) => exNames.add(n));
        Object.keys(data.powerSpeedExMap).forEach((n) => psNames.add(n));
      }
      setAthleteExOptions(Array.from(exNames).sort((a, b) => a.localeCompare(b)));
      setAthletePsOptions(Array.from(psNames).sort((a, b) => a.localeCompare(b)));
      setExOptionsLoaded(true);
    } catch (e) {
      setExOptionsError(e instanceof Error ? e.message : "Could not load exercise list");
    } finally {
      setExOptionsLoading(false);
    }
  };

  const handleGenerateSquad = async () => {
    if (!squadTargetIds.length || (!squadTtl && !squadE1rm && !squadPowerSpeed && !squadCompletion && !squadCardioHyrox)) return;
    setSquadError("");
    setSquadLoading(true);
    setSquadReport(null);
    // A loaded preset may already have specific exercises ticked -
    // only clear/auto-pick when nothing's been chosen yet, so
    // "Load preset" then "Generate" doesn't silently discard the
    // preset's exercise list.
    const hadPresetExercises = squadExercises.length > 0;
    const hadPresetPowerSpeedExercises = squadPowerSpeedExercises.length > 0;
    const hadPresetCardioHyroxOptions = squadCardioHyroxOptionIds.length > 0;
    if (!hadPresetExercises) setSquadExercises([]);
    if (!hadPresetPowerSpeedExercises) setSquadPowerSpeedExercises([]);
    if (!hadPresetCardioHyroxOptions) setSquadCardioHyroxOptionIds([]);
    try {
      const { start, end } = resolveDateRange(mode, customStart, customEnd);
      const results: SquadAthleteInput[] = [];
      for (const id of squadTargetIds) {
        const athlete = athleteById(id);
        const data = await generateReport(id, start, end);
        results.push({ athleteId: id, athleteName: athlete?.name ?? "Athlete", data });
      }
      setSquadAthleteReports(results);
      // e1RM "Current standing" is exercise-specific (see below) - default
      // to whichever exercise the squad has the most data for, so the
      // board isn't empty until the coach types something.
      if (squadE1rm && !hadPresetExercises) {
        const options = availableExercises(results);
        if (options.length) {
          const counts = new Map<string, number>();
          for (const { data } of results) {
            for (const name of Object.keys(data.strength.exMap)) counts.set(name, (counts.get(name) ?? 0) + 1);
          }
          setSquadExercises([[...options].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))[0]]);
        }
      }
      if (squadPowerSpeed && !hadPresetPowerSpeedExercises) {
        const options = availablePowerSpeedExercises(results);
        if (options.length) {
          const counts = new Map<string, number>();
          for (const { data } of results) {
            for (const name of Object.keys(data.powerSpeedExMap)) counts.set(name, (counts.get(name) ?? 0) + 1);
          }
          setSquadPowerSpeedExercises([[...options].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))[0]]);
        }
      }
      if (squadCardioHyrox && !hadPresetCardioHyroxOptions) {
        const options = availableCardioHyroxMetrics(results);
        if (options.length) {
          const counts = new Map<string, number>();
          for (const { data } of results) {
            for (const m of data.cardioMetricSummaries) {
              const id = cardioMetricOptionId({ sessionType: m.sessionType, key: m.key, group: m.group });
              counts.set(id, (counts.get(id) ?? 0) + 1);
            }
          }
          setSquadCardioHyroxOptionIds([[...options].map(cardioMetricOptionId).sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))[0]]);
        }
      }
      setSquadReport(
        computeSquadReport(results, { includeTtl: squadTtl, includeE1rm: squadE1rm, includeCompletion: squadCompletion, bodyweightRelative: squadBodyweightRelative })
      );
    } catch (e) {
      setSquadError(e instanceof Error ? e.message : "Could not generate squad report");
    } finally {
      setSquadLoading(false);
    }
  };

  const handleSquadPrint = async () => {
    if (!squadReport) return;
    setSquadError("");
    setSquadPdfLoading(true);
    // Same synchronous-open-then-navigate trick as handlePreview below -
    // opening the tab only after the async PDF render would lose the
    // click's user-gesture context and get popup-blocked.
    const win = window.open("", "_blank");
    try {
      const { start, end } = resolveDateRange(mode, customStart, customEnd);
      const rangeLabel = start && end ? `${start} to ${end}` : "All time";
      const generated = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const blob = await pdf(
        <SquadReportPdf
          groupName={squadGroupName ?? "Squad"}
          athleteCount={squadTargetIds.length}
          rangeLabel={rangeLabel}
          generated={generated}
          report={squadReport}
          ttl={squadTtl}
          e1rm={squadE1rm}
          powerSpeed={squadPowerSpeed}
          cardioHyrox={squadCardioHyrox}
          completion={squadCompletion}
          exerciseBoards={exerciseBoards}
          powerSpeedBoards={powerSpeedBoards}
          cardioHyroxBoards={cardioHyroxBoards}
          matrixRows={squadAthleteReports ? computeSquadMatrix(squadAthleteReports, squadExercises, squadBodyweightRelative) : []}
          trendAthletes={squadAthleteReports ?? []}
          trendExerciseOverride={squadExercises}
          limitTo8={squadLimitTo8}
          trendTonnage={squadTrendTonnage}
          trendE1rm={squadTrendE1rm}
          bodyweightRelative={squadBodyweightRelative}
          branding={branding}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      if (win) win.location.href = url;
      else setSquadError("Pop-up blocked — allow pop-ups for this site, then try again.");
    } catch (e) {
      win?.close();
      setSquadError(e instanceof Error ? e.message : "Could not generate PDF");
    } finally {
      setSquadPdfLoading(false);
    }
  };

  const handlePreview = async () => {
    if (!targetIds.length) return;
    setPdfError("");
    setPreviewLoading(true);
    // Open the tab synchronously, in direct response to the click, then
    // navigate it once the PDF is ready - opening it only after the
    // await below would lose the user-gesture context and get silently
    // popup-blocked in most browsers. Embedding the PDF in an in-app
    // iframe instead (the previous approach) avoided that, but its
    // toolbar's print button is unreliable across browsers - a full
    // native tab gives the browser's own PDF viewer, so print/download/
    // zoom all just work like any other PDF link.
    const win = window.open("", "_blank");
    try {
      const { start, end } = resolveDateRange(mode, customStart, customEnd);
      const id = targetIds[0];
      const athlete = athleteById(id);
      const data = await generateReport(id, start, end);
      const aiSummary =
        options.aiSummary && includeBulkAi
          ? await fetchAiSummary(id, start, end, options)
          : null;
      const blob = await pdf(
        <AthleteReportPdf
          data={data}
          athleteName={athlete?.name ?? "Athlete"}
          athleteGroup={athlete?.group}
          options={options}
          aiSummary={aiSummary}
          branding={branding}
          exerciseSelection={exerciseSelection}
          powerSpeedSelection={powerSpeedSelection}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      if (win) win.location.href = url;
      else setPdfError("Pop-up blocked — allow pop-ups for this site, then try again.");
    } catch (e) {
      win?.close();
      setPdfError(e instanceof Error ? e.message : "Could not generate preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownloadAll = async () => {
    if (!targetIds.length) return;
    setPdfError("");
    setPdfBusy(true);
    try {
      const { start, end } = resolveDateRange(mode, customStart, customEnd);
      const zip = new JSZip();
      // Sequential, not Promise.all - a large squad means N Supabase reads
      // plus (if includeBulkAi) N paid AI calls; running them one at a
      // time avoids hammering either service for a bulk action.
      for (const id of targetIds) {
        const athlete = athleteById(id);
        const data = await generateReport(id, start, end);
        const aiSummary =
          options.aiSummary && includeBulkAi
            ? await fetchAiSummary(id, start, end, options)
            : null;
        const blob = await pdf(
          <AthleteReportPdf
            data={data}
            athleteName={athlete?.name ?? "Athlete"}
            athleteGroup={athlete?.group}
            options={options}
            aiSummary={aiSummary}
            branding={branding}
            exerciseSelection={exerciseSelection}
            powerSpeedSelection={powerSpeedSelection}
          />
        ).toBlob();
        const slug = (athlete?.name ?? "athlete").toLowerCase().replace(/\s+/g, "-");
        zip.file(`${slug}-training-report-${todayISO()}.pdf`, blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `visbuild-reports-${todayISO()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : "Could not generate reports");
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div style={s.page}>
      <h1 style={s.title}>Reporting</h1>

      <div style={s.tabRow}>
        {(["athletes", "squad"] as Tab[]).map((t) => (
          <button key={t} style={{ ...s.tabBtn, ...(tab === t ? s.tabBtnActive : {}) }} onClick={() => setTab(t)}>
            {t === "athletes" ? "Athlete Reports" : "Squad Report"}
          </button>
        ))}
      </div>

      {tab === "athletes" ? (
        <div style={s.layout}>
          <div style={s.col}>
            <div style={s.card}>
              <div style={s.cardTitle}>Athletes</div>
              <ReportTargetPicker
                key="athletes-picker"
                selectedIds={targetIds}
                onChange={(ids) => setTargetIds(ids)}
              />
            </div>
          </div>

          <div style={s.col}>
            <div style={s.card}>
              <div style={s.cardTitle}>Date range</div>
              <DateRangePicker
                mode={mode}
                onModeChange={setMode}
                customStart={customStart}
                customEnd={customEnd}
                onCustomStartChange={setCustomStart}
                onCustomEndChange={setCustomEnd}
              />
            </div>

            <div style={s.card}>
              <div style={s.cardTitle}>Metrics</div>

              {presets.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={s.fieldLabel}>Load preset</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <select value={selectedPresetId} onChange={(e) => handleLoadPreset(e.target.value)} style={{ ...s.input, flex: 1 }}>
                      <option value="">- Select a saved preset -</option>
                      {presets.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    {selectedPresetId && (
                      <button style={s.smallGhostBtn} onClick={() => handleDeletePreset(selectedPresetId)} title="Delete this preset">
                        🗑
                      </button>
                    )}
                  </div>
                </div>
              )}

              <ReportOptionsForm
                options={options}
                onChange={setOptions}
                hyroxEnabled={targetIds.length === 0 || athletes.some((a) => targetIds.includes(a.id) && a.hyrox_enabled)}
              />

              {(options.lineChart || options.powerSpeedTrend) && (
                <div style={{ marginTop: 4, marginBottom: 14 }}>
                  <div style={s.fieldLabel}>
                    Tick specific exercises for the trend chart(s) below — leave untouched to auto-pick
                    {options.lineChart ? ` the top ${options.exerciseLimit} by session count` : " every exercise found"}.
                  </div>
                  <button
                    style={{ ...s.smallGhostBtn, opacity: targetIds.length && !exOptionsLoading ? 1 : 0.5, marginBottom: exOptionsLoaded ? 10 : 0 }}
                    disabled={!targetIds.length || exOptionsLoading}
                    onClick={handleLoadExerciseOptions}
                  >
                    {exOptionsLoading ? "Loading…" : exOptionsLoaded ? "🔄 Reload exercise list" : "🔍 Load exercise list"}
                  </button>
                  {!targetIds.length && <div style={s.hint}>Pick at least one athlete first.</div>}
                  {exOptionsError && <div style={s.errorHint}>{exOptionsError}</div>}

                  {exOptionsLoaded && options.lineChart && (
                    <div style={{ marginBottom: options.powerSpeedTrend ? 12 : 0 }}>
                      <div style={s.fieldLabel}>Strength (TTL / e1RM)</div>
                      {athleteExOptions.length === 0 ? (
                        <div style={s.emptySmall}>No strength data in this range.</div>
                      ) : (
                        <>
                          <input
                            value={athleteExSearch}
                            onChange={(e) => setAthleteExSearch(e.target.value)}
                            placeholder="Search exercises…"
                            style={{ ...s.input, marginBottom: 8 }}
                          />
                          <div style={s.exerciseCheckList}>
                            {filteredAthleteExOptions.length === 0 ? (
                              <div style={s.emptySmall}>No exercises match &quot;{athleteExSearch}&quot;.</div>
                            ) : (
                              filteredAthleteExOptions.map((name) => (
                                <label key={name} style={s.exerciseCheckRow}>
                                  <input
                                    type="checkbox"
                                    checked={exerciseSelection.includes(name)}
                                    onChange={() => toggleExerciseSelection(name)}
                                    style={{ accentColor: "var(--accent)" }}
                                  />
                                  {name}
                                </label>
                              ))
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {exOptionsLoaded && options.powerSpeedTrend && (
                    <div>
                      <div style={s.fieldLabel}>Power / Speed</div>
                      {athletePsOptions.length === 0 ? (
                        <div style={s.emptySmall}>No power/speed data in this range.</div>
                      ) : (
                        <>
                          <input
                            value={athletePsSearch}
                            onChange={(e) => setAthletePsSearch(e.target.value)}
                            placeholder="Search exercises…"
                            style={{ ...s.input, marginBottom: 8 }}
                          />
                          <div style={s.exerciseCheckList}>
                            {filteredAthletePsOptions.length === 0 ? (
                              <div style={s.emptySmall}>No exercises match &quot;{athletePsSearch}&quot;.</div>
                            ) : (
                              filteredAthletePsOptions.map((name) => (
                                <label key={name} style={s.exerciseCheckRow}>
                                  <input
                                    type="checkbox"
                                    checked={powerSpeedSelection.includes(name)}
                                    onChange={() => togglePowerSpeedSelection(name)}
                                    style={{ accentColor: "var(--accent)" }}
                                  />
                                  {name}
                                </label>
                              ))
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: 4 }}>
                <div style={s.fieldLabel}>Save current metrics as a preset</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="Preset name, e.g. Monthly strength check-in"
                    style={{ ...s.input, flex: 1 }}
                  />
                  <button
                    style={{ ...s.ghostActionBtn, opacity: presetName.trim() && !presetSaving ? 1 : 0.5, padding: "9px 14px" }}
                    disabled={!presetName.trim() || presetSaving}
                    onClick={handleSavePreset}
                  >
                    {presetSaving ? "Saving…" : "💾 Save"}
                  </button>
                </div>
                {presetError && <div style={s.errorHint}>{presetError}</div>}
              </div>
            </div>

            <div style={s.card}>
              <div style={s.cardTitle}>Reports (PDF)</div>
              <label style={{ ...s.checkboxRow, opacity: options.aiSummary ? 1 : 0.5 }}>
                <input
                  type="checkbox"
                  checked={includeBulkAi}
                  disabled={!options.aiSummary}
                  onChange={(e) => setIncludeBulkAi(e.target.checked)}
                  style={{ accentColor: "var(--accent)" }}
                />
                Include AI summary ({targetIds.length || 0} extra AI call{targetIds.length === 1 ? "" : "s"})
              </label>
              {!options.aiSummary && <div style={s.hint}>Turn on "AI summary" under Metrics first.</div>}
              <div style={s.actionRow}>
                <button
                  style={{ ...s.ghostActionBtn, opacity: targetIds.length && !previewLoading ? 1 : 0.5 }}
                  disabled={!targetIds.length || previewLoading}
                  onClick={handlePreview}
                >
                  {previewLoading ? "Generating…" : "👁 Preview / print 1 report"}
                </button>
                <button
                  style={{ ...s.actionBtn, opacity: targetIds.length && !pdfBusy ? 1 : 0.5 }}
                  disabled={!targetIds.length || pdfBusy}
                  onClick={handleDownloadAll}
                >
                  {pdfBusy ? "Generating…" : `📦 Download reports (${targetIds.length || 0}) as ZIP`}
                </button>
              </div>
              {pdfError && <div style={s.errorHint}>{pdfError}</div>}
            </div>

            <div style={s.card}>
              <div style={s.cardTitle}>Raw data export</div>
              <div style={s.actionRow}>
                <button
                  style={{ ...s.actionBtn, opacity: targetIds.length ? 1 : 0.5 }}
                  disabled={!targetIds.length}
                  onClick={() => setExportOpen(true)}
                >
                  📥 Download CSV
                </button>
              </div>
              {!targetIds.length && <div style={s.hint}>Pick at least one athlete first.</div>}
            </div>
          </div>
        </div>
      ) : (
        <div style={s.layout}>
          <div style={s.col}>
            <div style={s.card}>
              <div style={s.cardTitle}>Group</div>
              <ReportTargetPicker
                key="squad-picker"
                groupOnly
                selectedIds={squadTargetIds}
                onChange={(ids, _groupId, groupName) => {
                  setSquadTargetIds(ids);
                  setSquadGroupName(groupName);
                  setSquadReport(null);
                  setSquadAthleteReports(null);
                  setSquadExercises([]);
                  setSquadExerciseSearch("");
                }}
              />
            </div>

            <div style={s.card}>
              <div style={s.cardTitle}>Date range</div>
              <DateRangePicker
                mode={mode}
                onModeChange={setMode}
                customStart={customStart}
                customEnd={customEnd}
                onCustomStartChange={setCustomStart}
                onCustomEndChange={setCustomEnd}
              />
            </div>
          </div>

          <div style={s.col}>
            <div style={s.card}>
              <div style={s.cardTitle}>Leaderboards</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                <label style={s.checkboxRow}>
                  <input type="checkbox" checked={squadTtl} onChange={(e) => setSquadTtl(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                  Total Training Load
                </label>
                <label style={s.checkboxRow}>
                  <input type="checkbox" checked={squadE1rm} onChange={(e) => setSquadE1rm(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                  Estimated 1RM
                </label>
                <label style={{ ...s.checkboxRow, opacity: squadE1rm ? 1 : 0.5, marginLeft: 22 }}>
                  <input
                    type="checkbox"
                    checked={squadBodyweightRelative}
                    disabled={!squadE1rm}
                    onChange={(e) => setSquadBodyweightRelative(e.target.checked)}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  Bodyweight-relative e1RM
                </label>
                <label style={s.checkboxRow}>
                  <input type="checkbox" checked={squadPowerSpeed} onChange={(e) => setSquadPowerSpeed(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                  Power / Speed
                </label>
                <label style={s.checkboxRow}>
                  <input type="checkbox" checked={squadCardioHyrox} onChange={(e) => setSquadCardioHyrox(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                  Cardio / Hybrid exercise board
                </label>
                <label style={s.checkboxRow}>
                  <input type="checkbox" checked={squadCompletion} onChange={(e) => setSquadCompletion(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                  Session completion
                </label>
              </div>
              {!squadTtl && !squadE1rm && !squadPowerSpeed && !squadCompletion && !squadCardioHyrox && <div style={s.hint}>Pick at least one metric to rank on.</div>}

              <div style={s.fieldLabel}>PDF · per-athlete exercise trend charts</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                <label style={s.checkboxRow}>
                  <input type="checkbox" checked={squadTrendTonnage} onChange={(e) => setSquadTrendTonnage(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                  Tonnage trend
                </label>
                <label style={s.checkboxRow}>
                  <input type="checkbox" checked={squadTrendE1rm} onChange={(e) => setSquadTrendE1rm(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                  e1RM trend
                </label>
              </div>
              <label style={s.checkboxRow}>
                <input type="checkbox" checked={squadLimitTo8} onChange={(e) => setSquadLimitTo8(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                Limit to 8 exercises per sheet
              </label>
              <div style={s.hint}>
                {squadLimitTo8
                  ? "Trend pages and the Squad Overview sheets show up to 8 exercises. Uncheck to include all — spread across extra sheets, 8 per sheet."
                  : "Including all exercises — trend pages and Squad Overview sheets will paginate, 8 exercises per sheet."}
              </div>

              {squadPresets.length > 0 && (
                <div style={{ marginTop: 10, marginBottom: 10 }}>
                  <div style={s.fieldLabel}>Load preset</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <select value={selectedSquadPresetId} onChange={(e) => handleLoadSquadPreset(e.target.value)} style={{ ...s.input, flex: 1 }}>
                      <option value="">- Select a saved preset -</option>
                      {squadPresets.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    {selectedSquadPresetId && (
                      <button style={s.smallGhostBtn} onClick={() => handleDeleteSquadPreset(selectedSquadPresetId)} title="Delete this preset">
                        🗑
                      </button>
                    )}
                  </div>
                </div>
              )}
              <div style={{ marginTop: 4, marginBottom: 14 }}>
                <div style={s.fieldLabel}>Save current config as a preset</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={squadPresetName}
                    onChange={(e) => setSquadPresetName(e.target.value)}
                    placeholder="Preset name, e.g. Monthly squad check-in"
                    style={{ ...s.input, flex: 1 }}
                  />
                  <button
                    style={{ ...s.ghostActionBtn, opacity: squadPresetName.trim() && !squadPresetSaving ? 1 : 0.5, padding: "9px 14px" }}
                    disabled={!squadPresetName.trim() || squadPresetSaving}
                    onClick={handleSaveSquadPreset}
                  >
                    {squadPresetSaving ? "Saving…" : "💾 Save"}
                  </button>
                </div>
                <div style={s.hint}>Saved presets also restore the ticked exercise list, once you re-generate for a group.</div>
                {squadPresetError && <div style={s.errorHint}>{squadPresetError}</div>}
              </div>

              <button
                style={{ ...s.actionBtn, opacity: squadTargetIds.length && (squadTtl || squadE1rm || squadPowerSpeed || squadCompletion || squadCardioHyrox) && !squadLoading ? 1 : 0.5 }}
                disabled={!squadTargetIds.length || (!squadTtl && !squadE1rm && !squadPowerSpeed && !squadCompletion && !squadCardioHyrox) || squadLoading}
                onClick={handleGenerateSquad}
              >
                {squadLoading ? "Generating…" : "🏆 Generate squad report"}
              </button>
              {!squadGroupName ? (
                <div style={s.hint}>Pick a group first.</div>
              ) : (
                !squadTargetIds.length && (
                  <div style={s.hint}>&quot;{squadGroupName}&quot; has no athletes in it yet — add some from the Athletes page first.</div>
                )
              )}
              {squadError && <div style={s.errorHint}>{squadError}</div>}
            </div>

            {squadReport && (
              <>
                <div style={{ ...s.squadHeading, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>
                    {squadGroupName ?? "Squad"} · {squadTargetIds.length} athlete{squadTargetIds.length === 1 ? "" : "s"}
                  </span>
                  <button
                    style={{ ...s.ghostActionBtn, padding: "6px 12px", fontSize: 12, opacity: squadPdfLoading ? 0.6 : 1 }}
                    disabled={squadPdfLoading}
                    onClick={handleSquadPrint}
                  >
                    {squadPdfLoading ? "Generating…" : "🖨 Print / download PDF"}
                  </button>
                </div>
                {squadTtl && (
                  <div style={s.boardRow}>
                    <Leaderboard title="TTL · Current standing" unit=" kg" standing={squadReport.ttlStanding} />
                    <Leaderboard title="TTL · Most improved" improved={squadReport.ttlImproved} />
                  </div>
                )}
                {squadE1rm && (
                  <>
                    <div style={s.boardRow}>
                      <div style={s.card}>
                        <div style={s.cardTitle}>e1RM · Current standing</div>
                        {exerciseOptions.length === 0 ? (
                          <div style={s.emptyNote}>No e1RM data in this range.</div>
                        ) : (
                          <>
                            <div style={s.fieldLabel}>
                              Tick exercises to rank the squad on (e.g. Back Squat, Bench Press, Shoulder Press) — one board per tick. Also used for the PDF's per-athlete exercise trend charts; leave untouched to auto-pick each athlete's own top 8 by tonnage instead.
                            </div>
                            <input
                              value={squadExerciseSearch}
                              onChange={(e) => setSquadExerciseSearch(e.target.value)}
                              placeholder="Search exercises…"
                              style={{ ...s.input, marginBottom: 8 }}
                            />
                            <div style={s.exerciseCheckList}>
                              {filteredExerciseOptions.length === 0 ? (
                                <div style={s.emptySmall}>No exercises match &quot;{squadExerciseSearch}&quot;.</div>
                              ) : (
                                filteredExerciseOptions.map((name) => (
                                  <label key={name} style={s.exerciseCheckRow}>
                                    <input
                                      type="checkbox"
                                      checked={squadExercises.includes(name)}
                                      onChange={() => toggleSquadExercise(name)}
                                      style={{ accentColor: "var(--accent)" }}
                                    />
                                    {name}
                                  </label>
                                ))
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      <Leaderboard title="e1RM · Most improved" improved={squadReport.e1rmImproved} />
                    </div>

                    {exerciseBoards.length > 0 && (
                      <div style={s.boardRow}>
                        {exerciseBoards.map(({ name, rows }) => (
                          <div key={name} style={s.card}>
                            <div style={s.cardTitle}>e1RM · {name}</div>
                            {rows.length === 0 ? (
                              <div style={s.emptyNote}>Nobody in this group has logged &quot;{name}&quot;.</div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                {rows.map((r, i) => (
                                  <div key={r.athleteId} style={s.boardRowItem}>
                                    <span style={s.boardRank}>{i + 1}</span>
                                    <span style={s.boardName}>{r.athleteName}</span>
                                    <span style={s.boardValue}>
                                      {r.value.toFixed(squadBodyweightRelative ? 2 : 1)}
                                      {squadBodyweightRelative ? "×BW" : " kg"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {squadPowerSpeed && (
                  <>
                    <div style={s.boardRow}>
                      <div style={s.card}>
                        <div style={s.cardTitle}>Power / Speed · Current standing</div>
                        {powerSpeedExerciseOptions.length === 0 ? (
                          <div style={s.emptyNote}>No power/speed data in this range.</div>
                        ) : (
                          <>
                            <div style={s.fieldLabel}>
                              Tick exercises to rank the squad on (e.g. 10m Sprint, Broad Jump, CMJ) — one board per tick. Leave untouched to auto-pick whichever exercise the squad has the most data for.
                            </div>
                            <input
                              value={squadPowerSpeedSearch}
                              onChange={(e) => setSquadPowerSpeedSearch(e.target.value)}
                              placeholder="Search exercises…"
                              style={{ ...s.input, marginBottom: 8 }}
                            />
                            <div style={s.exerciseCheckList}>
                              {filteredPowerSpeedExerciseOptions.length === 0 ? (
                                <div style={s.emptySmall}>No exercises match &quot;{squadPowerSpeedSearch}&quot;.</div>
                              ) : (
                                filteredPowerSpeedExerciseOptions.map((name) => (
                                  <label key={name} style={s.exerciseCheckRow}>
                                    <input
                                      type="checkbox"
                                      checked={squadPowerSpeedExercises.includes(name)}
                                      onChange={() => toggleSquadPowerSpeedExercise(name)}
                                      style={{ accentColor: "var(--accent)" }}
                                    />
                                    {name}
                                  </label>
                                ))
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {powerSpeedBoards.length > 0 && (
                      <div style={s.boardRow}>
                        {powerSpeedBoards.map(({ name, rows, unit, direction }) => (
                          <div key={name} style={s.card}>
                            <div style={s.cardTitle}>
                              {name} <span style={{ fontWeight: 400, color: "var(--mute)" }}>({direction === "lower" ? "lower is better" : "higher is better"})</span>
                            </div>
                            {rows.length === 0 ? (
                              <div style={s.emptyNote}>Nobody in this group has logged &quot;{name}&quot;.</div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                {rows.map((r, i) => (
                                  <div key={r.athleteId} style={s.boardRowItem}>
                                    <span style={s.boardRank}>{i + 1}</span>
                                    <span style={s.boardName}>{r.athleteName}</span>
                                    <span style={s.boardValue}>
                                      {r.value.toFixed(unit === "s" && r.value < 10 ? 2 : 1)}
                                      {unit}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {squadCardioHyrox && (
                  <>
                    <div style={s.boardRow}>
                      <div style={s.card}>
                        <div style={s.cardTitle}>Cardio / Hybrid · Current standing</div>
                        {cardioHyroxOptions.length === 0 ? (
                          <div style={s.emptyNote}>No cardio/hybrid metric data in this range.</div>
                        ) : (
                          <>
                            <div style={s.fieldLabel}>
                              Tick a metric + exercise to rank the squad on (e.g. Distance — Row (Cycling Intervals)) — one board per tick. Deliberately no "total distance" style board across everything - different sub-types aren&apos;t comparable, so each board is one exact exercise + protocol. Leave untouched to auto-pick whichever the squad has the most data for.
                            </div>
                            <input
                              value={squadCardioHyroxSearch}
                              onChange={(e) => setSquadCardioHyroxSearch(e.target.value)}
                              placeholder="Search metrics/exercises…"
                              style={{ ...s.input, marginBottom: 8 }}
                            />
                            <div style={s.exerciseCheckList}>
                              {filteredCardioHyroxOptions.length === 0 ? (
                                <div style={s.emptySmall}>No metrics match &quot;{squadCardioHyroxSearch}&quot;.</div>
                              ) : (
                                filteredCardioHyroxOptions.map((o) => {
                                  const id = cardioMetricOptionId(o);
                                  return (
                                    <label key={id} style={s.exerciseCheckRow}>
                                      <input
                                        type="checkbox"
                                        checked={squadCardioHyroxOptionIds.includes(id)}
                                        onChange={() => toggleSquadCardioHyroxOption(id)}
                                        style={{ accentColor: "var(--accent)" }}
                                      />
                                      {METRIC_META[o.key].label} — {o.group}
                                      <span style={{ color: "var(--mute)" }}> ({o.sessionType})</span>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {cardioHyroxBoards.length > 0 && (
                      <div style={s.boardRow}>
                        {cardioHyroxBoards.map(({ id, title, rows, unit, direction, decimals }) => (
                          <div key={id} style={s.card}>
                            <div style={s.cardTitle}>
                              {title}{" "}
                              <span style={{ fontWeight: 400, color: "var(--mute)" }}>({direction === "lower" ? "lower is better" : "higher is better"})</span>
                            </div>
                            {rows.length === 0 ? (
                              <div style={s.emptyNote}>Nobody in this group has logged this.</div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                {rows.map((r, i) => (
                                  <div key={r.athleteId} style={s.boardRowItem}>
                                    <span style={s.boardRank}>{i + 1}</span>
                                    <span style={s.boardName}>{r.athleteName}</span>
                                    <span style={s.boardValue}>
                                      {r.value.toFixed(decimals)}
                                      {unit ? ` ${unit}` : ""}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {squadCompletion && (
                  <div style={s.boardRow}>
                    <Leaderboard title="Session completion · Top 5" completion={squadReport.completionTop} />
                    <Leaderboard title="To watch · Lowest completion" completion={squadReport.completionWatch} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {exportOpen && (
        <ExportModal mode="selection" athleteIds={targetIds} onClose={() => setExportOpen(false)} />
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, margin: "0 0 16px" },
  tabRow: { display: "flex", gap: 4, border: "1px solid var(--line)", borderRadius: 10, padding: 4, marginBottom: 20, width: "fit-content" },
  tabBtn: { background: "transparent", border: "none", color: "var(--mute)", padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 8 },
  tabBtnActive: { background: "var(--accent-dim)", color: "var(--accent)" },
  layout: { display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, alignItems: "start" },
  col: { display: "flex", flexDirection: "column", gap: 16 },
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16 },
  cardTitle: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12, textTransform: "uppercase" as const, letterSpacing: "0.04em" },
  emptyNote: { fontSize: 13, color: "var(--mute)", fontStyle: "italic" },
  actionRow: { display: "flex", gap: 10, flexWrap: "wrap" as const },
  actionBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "12px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  ghostActionBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 10, padding: "12px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  hint: { fontSize: 12, color: "var(--mute)", marginTop: 8 },
  errorHint: { fontSize: 12, color: "#ff7d7d", marginTop: 8 },
  fieldLabel: { fontSize: 11, color: "var(--mute)", marginBottom: 4 },
  input: {
    width: "100%",
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 14,
    boxSizing: "border-box" as const,
  },
  smallGhostBtn: {
    background: "transparent",
    border: "1px solid var(--line)",
    color: "var(--mute)",
    borderRadius: 8,
    padding: "0 10px",
    fontSize: 13,
    cursor: "pointer",
    flexShrink: 0,
  },
  checkboxRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)", marginBottom: 4, cursor: "pointer" },
  emptySmall: { fontSize: 12, color: "var(--mute)", padding: "8px 4px" },
  exerciseCheckList: { display: "flex", flexDirection: "column", gap: 2, maxHeight: 220, overflowY: "auto" as const, border: "1px solid var(--line)", borderRadius: 8, padding: 8 },
  exerciseCheckRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)", cursor: "pointer", padding: "4px 4px" },
  squadHeading: { fontSize: 13, fontWeight: 700, color: "var(--mute)", margin: "4px 0 -4px" },
  boardRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  boardRowItem: { display: "flex", alignItems: "baseline", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: 13 },
  boardRank: { width: 18, flexShrink: 0, fontWeight: 700, color: "var(--mute)", fontSize: 12 },
  boardName: { flex: 1, fontWeight: 600, color: "var(--text)" },
  boardSub: { fontWeight: 400, color: "var(--mute)", fontSize: 11 },
  boardValue: { fontWeight: 700, color: "var(--text)", flexShrink: 0 },
};

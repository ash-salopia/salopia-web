import { createClient } from "@/lib/supabase-browser";
import type { Session, SessionExercise } from "@/types";
import { addDaysISO, todayISO } from "@/lib/date-utils";
import { dailyLoads, acwrSeries, weeklySpikes, weeklyLoads, weeklyMonotonyStrain, LOAD_TYPES, MONOTONY_HIGH } from "@/lib/training-load";
import type { OrgSettings } from "@/lib/data/settings";

export interface LoadFlag {
  athleteId: string;
  athleteName: string;
  reasons: string[]; // e.g. ["ACWR 1.62 (spike)", "Week +74% vs avg", "Monotony 2.4"]
  severe: boolean; // ACWR well over the ceiling — colour the panel dot red
}

// One batched query for every active athlete, then compute in JS. Only run
// when the org's load-monitoring master toggle is on.
export async function listLoadFlags(settings: OrgSettings): Promise<LoadFlag[]> {
  const lm = settings.load_monitoring;
  if (!settings.load_monitoring_enabled || (!lm.acwr && !lm.load_spike_alert && !lm.monotony_strain)) return [];

  const supabase = createClient();
  const { data: athletes } = await supabase
    .from("athletes")
    .select("id, name")
    .eq("archived", false);
  if (!athletes || athletes.length === 0) return [];

  const rangeStart = addDaysISO(todayISO(), -41); // ~6 weeks — enough for ACWR + a 4-week spike baseline
  const rangeEnd = todayISO();

  const { data: rows } = await supabase
    .from("sessions")
    .select("*, session_exercises(*)")
    .in("athlete_id", athletes.map((a) => a.id))
    .in("session_source", ["programme", "athlete_logged"])
    .gte("date", rangeStart)
    .lte("date", rangeEnd);

  const byAthlete = new Map<string, Session[]>();
  for (const r of rows ?? []) {
    const s = { ...r, exercises: (r.session_exercises ?? []) as SessionExercise[] } as Session;
    if (!LOAD_TYPES.includes(s.type)) continue;
    if (!byAthlete.has(s.athlete_id)) byAthlete.set(s.athlete_id, []);
    byAthlete.get(s.athlete_id)!.push(s);
  }

  const flags: LoadFlag[] = [];
  for (const a of athletes) {
    const sessions = byAthlete.get(a.id) ?? [];
    if (sessions.length === 0) continue;
    const daily = dailyLoads(sessions, rangeStart, rangeEnd);
    const reasons: string[] = [];
    let severe = false;

    if (lm.acwr) {
      const series = acwrSeries(daily, { low: settings.acwr_low, high: settings.acwr_high });
      let latest: (typeof series)[number] | null = null;
      for (let i = series.length - 1; i >= 0; i--) { if (series[i].acwr != null) { latest = series[i]; break; } }
      if (latest?.acwr != null && (latest.band === "spike" || latest.band === "detrain")) {
        reasons.push(`ACWR ${latest.acwr.toFixed(2)} (${latest.band === "spike" ? "spike" : "detraining"})`);
        if (latest.acwr > settings.acwr_high + 0.3) severe = true;
      }
    }

    if (lm.load_spike_alert) {
      const spikes = weeklySpikes(weeklyLoads(sessions), settings.load_spike_pct);
      const last = spikes[spikes.length - 1];
      if (last?.flagged && last.changePct != null) reasons.push(`Week +${last.changePct}% vs avg`);
    }

    if (lm.monotony_strain) {
      const mon = weeklyMonotonyStrain(daily);
      const last = [...mon].reverse().find((m) => m.monotony != null);
      if (last?.monotony != null && last.monotony > MONOTONY_HIGH) reasons.push(`Monotony ${last.monotony.toFixed(1)}`);
    }

    if (reasons.length) flags.push({ athleteId: a.id, athleteName: a.name, reasons, severe });
  }

  return flags.sort((x, y) => Number(y.severe) - Number(x.severe) || x.athleteName.localeCompare(y.athleteName));
}

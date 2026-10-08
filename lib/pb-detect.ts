import { createServiceRoleClient } from "@/lib/supabase-service";
import type { SetLog } from "@/types";

export type PBKind = "weight" | "e1rm" | "volume" | "bw_reps" | "bw_time";

export interface DetectedPB {
  kind: PBKind;
  exerciseName: string;
  weightKg: number | null;
  reps: number | null;
  timeSeconds: number | null;
  e1rmKg: number | null;
  volumeKg: number | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Estimated 1-rep max (Epley). A plain top-weight comparison can't see
// "more reps at the same weight" as an improvement at all - this can,
// since more reps at an unchanged weight always raises it.
function epley1RM(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

// Reconciles every PB "lane" for this athlete+exercise+session against
// the current log every time a set is saved - not just "insert on
// improvement" - so correcting a typo after the fact updates or removes
// whichever lane(s) it affected, rather than leaving stale rows behind.
//
// Bodyweight exercises (is_bodyweight flag) keep exactly one lane each,
// unchanged from before 0110: reps-mode ('bw_reps') or time-mode
// ('bw_time'), decided by whether the exercise has a time prescription.
//
// A weighted exercise can independently earn up to three lanes in one
// save: 'weight' (heaviest single weight; its own comparison now also
// breaks ties on reps, so more reps at an unchanged top weight still
// updates it), 'e1rm' (best estimated 1RM across all done sets), and
// 'volume' (this session's total tonnage, summed across all done sets)
// - reported live: "well done/thumbs up message only works on
// increasing load, not increasing reps or TTL [total session volume]".
//
// Returns every lane that was GENUINELY new/improved this save (for the
// caller to celebrate/notify) - but every lane's row is kept in sync
// regardless, matching the pre-0110 behaviour for the 'weight' lane.
export async function detectPB(
  athleteId: string,
  exerciseId: string,
  sessionId: string,
  log: SetLog[]
): Promise<DetectedPB[]> {
  try {
    const supabase = createServiceRoleClient();

    const { data: exData, error: exErr } = await supabase
      .from("session_exercises")
      .select("name, session_id, is_bodyweight, time")
      .eq("id", exerciseId)
      .maybeSingle();
    if (exErr || !exData?.name) { console.error("[detectPB] exercise lookup failed", exErr); return []; }

    const { data: sessData, error: sessErr } = await supabase
      .from("sessions")
      .select("date")
      .eq("id", exData.session_id)
      .maybeSingle();
    if (sessErr || !sessData?.date) { console.error("[detectPB] session lookup failed", sessErr); return []; }
    const sessionDate = sessData.date;

    const isBodyweight = !!exData.is_bodyweight;
    const isTimeMode = isBodyweight && !!(exData.time ?? "").trim();

    const lanes: PBKind[] = isBodyweight
      ? [isTimeMode ? "bw_time" : "bw_reps"]
      : ["weight", "e1rm", "volume"];

    // Candidates computed once from the log, shared across lanes.
    let maxWeight = 0;
    let repsAtMaxWeight = 0;
    let maxReps = 0;
    let maxTime = 0;
    let bestE1rm = 0;
    let bestE1rmWeight = 0;
    let bestE1rmReps = 0;
    let volume = 0;
    for (const set of log) {
      if (!set.done) continue;
      if (isBodyweight) {
        if (isTimeMode) {
          const t = parseFloat(String(set.time ?? ""));
          if (!isNaN(t) && t > maxTime) maxTime = t;
        } else {
          const r = parseInt(String(set.reps ?? "")) || 0;
          if (r > maxReps) maxReps = r;
        }
        continue;
      }
      const w = parseFloat(String(set.weight));
      if (isNaN(w) || w <= 0) continue;
      const r = parseInt(String(set.reps)) || 0;
      // Best weight set: heaviest wins; an equal weight with MORE reps
      // also wins (the tie-break that makes "more reps at your best
      // weight" count without needing its own lane).
      if (w > maxWeight || (w === maxWeight && r > repsAtMaxWeight)) {
        maxWeight = w;
        repsAtMaxWeight = r;
      }
      const e1rm = epley1RM(w, r);
      if (e1rm > bestE1rm) { bestE1rm = e1rm; bestE1rmWeight = w; bestE1rmReps = r; }
      volume += w * r;
    }

    const detected: DetectedPB[] = [];

    for (const kind of lanes) {
      // This session's own (possibly stale) row for this lane, if any.
      const { data: sessionPbRows } = await supabase
        .from("personal_bests")
        .select("id, weight_kg, reps, time_seconds, e1rm_kg, volume_kg")
        .eq("athlete_id", athleteId)
        .ilike("exercise_name", exData.name)
        .eq("session_id", sessionId)
        .eq("pb_type", kind)
        .limit(1);
      const sessionPb = sessionPbRows?.[0] ?? null;

      // The bar this session's best must clear - every OTHER session's
      // row for this lane, excluding this session's own.
      let bestOtherQuery = supabase
        .from("personal_bests")
        .select("weight_kg, reps, time_seconds, e1rm_kg, volume_kg")
        .eq("athlete_id", athleteId)
        .ilike("exercise_name", exData.name)
        .eq("pb_type", kind);
      if (sessionPb) bestOtherQuery = bestOtherQuery.neq("id", sessionPb.id);
      const orderCol = kind === "e1rm" ? "e1rm_kg" : kind === "volume" ? "volume_kg" : kind === "bw_time" ? "time_seconds" : kind === "bw_reps" ? "reps" : "weight_kg";
      const { data: bestOther } = await bestOtherQuery.order(orderCol, { ascending: false }).limit(1).maybeSingle();

      let candidateValue: number;
      let candidateReps: number | null = null;
      let row: {
        weight_kg: number | null;
        reps: number | null;
        time_seconds: number | null;
        e1rm_kg: number | null;
        volume_kg: number | null;
      };
      switch (kind) {
        case "weight":
          candidateValue = maxWeight;
          candidateReps = repsAtMaxWeight || null;
          row = { weight_kg: maxWeight, reps: candidateReps, time_seconds: null, e1rm_kg: null, volume_kg: null };
          break;
        case "e1rm":
          candidateValue = round1(bestE1rm);
          row = { weight_kg: bestE1rmWeight, reps: bestE1rmReps || null, time_seconds: null, e1rm_kg: candidateValue, volume_kg: null };
          break;
        case "volume":
          candidateValue = Math.round(volume);
          row = { weight_kg: null, reps: null, time_seconds: null, e1rm_kg: null, volume_kg: candidateValue };
          break;
        case "bw_reps":
          candidateValue = maxReps;
          row = { weight_kg: null, reps: maxReps || null, time_seconds: null, e1rm_kg: null, volume_kg: null };
          break;
        case "bw_time":
        default:
          candidateValue = maxTime;
          row = { weight_kg: null, reps: null, time_seconds: maxTime || null, e1rm_kg: null, volume_kg: null };
          break;
      }

      // Weight lane's tie-break needs the threshold's reps too, not
      // just its weight - a plain numeric threshold can't tell "same
      // weight, more reps" from "no improvement".
      let beats: boolean;
      if (kind === "weight") {
        const thWeight = bestOther?.weight_kg ?? 0;
        const thReps = bestOther?.reps ?? 0;
        beats = candidateValue > 0 && (candidateValue > thWeight || (candidateValue === thWeight && (candidateReps ?? 0) > thReps));
      } else {
        const threshold = (bestOther as Record<string, number | null> | null)?.[orderCol] ?? 0;
        beats = candidateValue > 0 && candidateValue > threshold;
      }

      if (!beats) {
        // Not a PB in this lane (or nothing logged as done) - remove
        // any row this session previously produced for it, since it's
        // been corrected away.
        if (sessionPb) {
          const { error: delErr } = await supabase.from("personal_bests").delete().eq("id", sessionPb.id);
          if (delErr) console.error("[detectPB] stale PB delete failed", delErr);
        }
        continue;
      }

      const fullRow = {
        athlete_id: athleteId,
        exercise_name: exData.name,
        date: sessionDate,
        session_id: sessionId,
        pb_type: kind,
        ...row,
      };

      const { error: upsertErr } = await supabase
        .from("personal_bests")
        .upsert(fullRow, { onConflict: "athlete_id,exercise_name,session_id,pb_type" });
      if (upsertErr) { console.error("[detectPB] upsert failed", upsertErr); continue; }

      // Only celebrate when this save genuinely raised the bar over
      // what this session's row already had on record for this lane -
      // otherwise re-saving/tying an already-celebrated value would pop
      // the "New PB!" modal again for something already shown.
      const sessionPbValue = sessionPb ? ((sessionPb as Record<string, number | null>)[orderCol] ?? null) : null;
      const isNewOrImproved = sessionPbValue == null || candidateValue > sessionPbValue;

      // 0092 — a genuine new PB un-hides an exercise the coach
      // previously deleted the PB for. Runs for every kept-in-sync row
      // (not just newly-celebrated ones), matching pre-0110 behaviour.
      try {
        const { data: ath } = await supabase.from("athletes").select("pb_hidden").eq("id", athleteId).maybeSingle();
        const hidden: string[] = (ath as { pb_hidden?: string[] } | null)?.pb_hidden ?? [];
        const lower = exData.name.toLowerCase();
        if (hidden.some((h) => h.toLowerCase() === lower)) {
          await supabase.from("athletes").update({ pb_hidden: hidden.filter((h) => h.toLowerCase() !== lower) }).eq("id", athleteId);
        }
      } catch { /* column may not exist yet */ }

      if (isNewOrImproved) {
        detected.push({
          kind,
          exerciseName: exData.name,
          weightKg: (fullRow.weight_kg as number | null) ?? null,
          reps: (fullRow.reps as number | null) ?? null,
          timeSeconds: (fullRow.time_seconds as number | null) ?? null,
          e1rmKg: (fullRow.e1rm_kg as number | null) ?? null,
          volumeKg: (fullRow.volume_kg as number | null) ?? null,
        });
      }
    }

    return detected;
  } catch (e) {
    console.error("[detectPB] unexpected error", e);
    return [];
  }
}

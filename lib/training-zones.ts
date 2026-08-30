// 5-zone training-zone model (0086_athlete_aerobic_profile.sql).
//
// A generic S&C 5-zone framework anchored to Max HR and Maximal
// Aerobic Speed (MAS). Zone boundaries are % of max HR and % of MAS,
// editable per organisation (settings.zone_model). HR bands use the
// Karvonen / heart-rate-reserve method when a resting HR is known,
// otherwise plain %HRmax.

export interface ZoneRow {
  n: 1 | 2 | 3 | 4 | 5;
  name: string;
  hrLowPct: number;
  hrHighPct: number;
  masLowPct: number;
  masHighPct: number;
}

export interface ZoneModel {
  zones: ZoneRow[];
}

// Standard endurance 5-zone model. Names follow the convention used by
// most run/tri coaching (Friel etc.): Z3 = Tempo, Z4 = Threshold
// (lactate/anaerobic threshold), Z5 = VO2 Max. HR bounds are % of max
// HR (or HR reserve when a resting HR is set); MAS bounds are % of
// Maximal Aerobic Speed (100% MAS ≈ velocity at VO2max).
export const DEFAULT_ZONE_MODEL: ZoneModel = {
  zones: [
    { n: 1, name: "Recovery", hrLowPct: 50, hrHighPct: 68, masLowPct: 55, masHighPct: 68 },
    { n: 2, name: "Endurance", hrLowPct: 68, hrHighPct: 80, masLowPct: 68, masHighPct: 80 },
    { n: 3, name: "Tempo", hrLowPct: 80, hrHighPct: 87, masLowPct: 80, masHighPct: 88 },
    { n: 4, name: "Threshold", hrLowPct: 87, hrHighPct: 93, masLowPct: 88, masHighPct: 95 },
    { n: 5, name: "VO2 Max", hrLowPct: 93, hrHighPct: 100, masLowPct: 95, masHighPct: 115 },
  ],
};

export interface AerobicProfile {
  max_hr: number | null;
  resting_hr: number | null;
  mas_kmh: number | null;
}

export interface ComputedZone {
  n: number;
  name: string;
  hr: { low: number; high: number } | null;    // bpm
  speed: { low: number; high: number } | null; // km/h
  pace: { low: string; high: string } | null;  // m:ss per km — low = faster
}

export function paceFromSpeed(kmh: number): string {
  if (!kmh || kmh <= 0) return "—";
  const secPerKm = 3600 / kmh;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, "0")}`;
}

// Maximal Aerobic Speed from a maximal field test — distance covered
// in metres over the test duration in seconds. Returns km/h, 1 dp.
export function masFromTest(distanceM: number, durationSec: number): number {
  if (!distanceM || !durationSec) return 0;
  return Math.round((distanceM / durationSec) * 3.6 * 10) / 10;
}

// Tanaka et al. (2001): 208 − 0.7 × age. Needs a date of birth.
export function estimateMaxHr(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob + "T00:00:00Z");
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
  if (age < 5 || age > 90) return null;
  return Math.round(208 - 0.7 * age);
}

function hrAt(pct: number, maxHr: number, restingHr: number | null): number {
  if (restingHr && restingHr > 0 && restingHr < maxHr) {
    return Math.round(restingHr + (pct / 100) * (maxHr - restingHr));
  }
  return Math.round((pct / 100) * maxHr);
}

export function computeZones(p: AerobicProfile, model: ZoneModel = DEFAULT_ZONE_MODEL): ComputedZone[] {
  const maxHr = p.max_hr && p.max_hr > 0 ? p.max_hr : null;
  const mas = p.mas_kmh && p.mas_kmh > 0 ? p.mas_kmh : null;

  return model.zones.map((z) => {
    const hr = maxHr
      ? { low: hrAt(z.hrLowPct, maxHr, p.resting_hr), high: hrAt(z.hrHighPct, maxHr, p.resting_hr) }
      : null;
    const speed = mas
      ? { low: Math.round(mas * (z.masLowPct / 100) * 10) / 10, high: Math.round(mas * (z.masHighPct / 100) * 10) / 10 }
      : null;
    const pace = speed
      ? { low: paceFromSpeed(speed.high), high: paceFromSpeed(speed.low) } // faster pace = higher speed
      : null;
    return { n: z.n, name: z.name, hr, speed, pace };
  });
}

// "Z2 Aerobic · 138–158 bpm · 4:41–5:21 /km"
export function zoneSummary(z: ComputedZone): string {
  const parts = [`Z${z.n} ${z.name}`];
  if (z.hr) parts.push(`${z.hr.low}–${z.hr.high} bpm`);
  if (z.pace) parts.push(`${z.pace.low}–${z.pace.high} /km`);
  else if (z.speed) parts.push(`${z.speed.low}–${z.speed.high} km/h`);
  return parts.join(" · ");
}

export function hasAerobicProfile(p: AerobicProfile | null | undefined): boolean {
  return !!(p && ((p.max_hr && p.max_hr > 0) || (p.mas_kmh && p.mas_kmh > 0)));
}

// Resistance bands for assisted exercises (assisted pull-ups, dips, band
// presses...). A coach's band set lives in org settings (`bands`); an
// exercise is "banded" when its load names a band ("Red band") or its
// name says band/assisted. The athlete then picks a band per set instead
// of typing kg, and the log stores the band's name ("Red band") - text,
// so reports and e1RM leave it out of kg totals. Progression for an
// assisted lift = moving to a lighter band (less help).
//
// Pure - no Supabase - so the athlete app, coach editor and settings
// page can all use it.

export interface Band {
  name: string; // "Red"
  colour: string; // hex, for the chip
  range: string; // assistance or resistance, e.g. "10-15kg"
}

// A common graded set, lightest to heaviest. Every brand grades its own
// colours differently - coaches edit these in Settings to match theirs.
export const DEFAULT_BANDS: Band[] = [
  { name: "Yellow", colour: "#F5C518", range: "5-10kg" },
  { name: "Red", colour: "#E5484D", range: "10-15kg" },
  { name: "Black", colour: "#3A3F45", range: "15-25kg" },
  { name: "Purple", colour: "#8E4EC6", range: "25-35kg" },
  { name: "Green", colour: "#30A46C", range: "35-50kg" },
  { name: "Blue", colour: "#3E63DD", range: "50-65kg" },
];

export function bandsFrom(settings: { bands?: Band[] | null } | null | undefined): Band[] {
  const list = (settings?.bands ?? []).filter((b) => b && b.name?.trim());
  return list.length ? list : DEFAULT_BANDS;
}

/** "Red band" - what gets stored as a load or a logged set. */
export const bandLabel = (b: Band) => `${b.name} band`;

/** The band a load/log value names, if any ("Red band", "red", "Red band (10-15kg)"). */
export function bandOf(value: string | null | undefined, bands: Band[]): Band | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return null;
  return bands.find((b) => {
    const n = b.name.trim().toLowerCase();
    return v === n || v.startsWith(`${n} band`) || v === `${n} band`;
  }) ?? null;
}

/** Whether an exercise is logged by band rather than kg. */
export function isBandExercise(ex: { name?: string; target_load?: string; is_bodyweight?: boolean; completion_only?: boolean }, bands: Band[]): boolean {
  if (ex.completion_only) return false;
  if (bandOf(ex.target_load, bands)) return true;
  if (/\d/.test(ex.target_load ?? "")) return false; // a kg load wins
  return /\bband(ed)?\b|\bassisted\b/i.test(ex.name ?? "");
}

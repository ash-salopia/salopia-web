// Date helpers used throughout the app. These were debugged carefully
// in the original prototype — see addDaysISO's comment below for a real
// bug that only showed up in non-UTC timezones (British Summer Time
// specifically), where a naive local-time implementation could silently
// get stuck on the same date instead of advancing. Keep this exact
// implementation; don't simplify it back to the naive version.

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, n: number): string {
  // Pure date-part arithmetic — avoids the local-time/UTC round-trip bug
  // in `new Date(iso+"T00:00:00")` + `.toISOString()`. In timezones ahead
  // of UTC (e.g. British Summer Time, UTC+1), midnight local time is
  // still the previous day in UTC, so toISOString() could silently roll
  // the date back by a day, causing date-stepping loops to get stuck on
  // the same date instead of advancing.
  const [y, m, d] = iso.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d) + n * 86_400_000;
  return new Date(utcMidnight).toISOString().slice(0, 10);
}

export function datesInRange(start: string, end: string, cap = 90): string[] {
  if (!start || !end || end < start) return [];
  const out: string[] = [];
  let cur = start;
  while (cur <= end && out.length < cap) {
    out.push(cur);
    cur = addDaysISO(cur, 1);
  }
  return out;
}

export function daysBetween(fromISO: string, toISO: string): number {
  const [ay, am, ad] = fromISO.split("-").map(Number);
  const [by, bm, bd] = toISO.split("-").map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86_400_000);
}

const DAY_NAME_TO_NUM: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

// Parses "Mon,Wed,Fri" (or similar) into [1,3,5]. Unrecognised tokens are
// dropped silently — used for the CSV importer's optional Repeat Days column.
export function parseRepeatDays(input: string): number[] {
  if (!input) return [];
  return input
    .split(",")
    .map((d) => DAY_NAME_TO_NUM[d.trim().toLowerCase().slice(0, 3)])
    .filter((n): n is number => n != null);
}

// Day-of-week for a YYYY-MM-DD string, computed in UTC to stay consistent
// with the rest of these date-only (no time component) helpers.
export function dayOfWeekUTC(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export interface ProgrammeStatus {
  lastDate: string | null;
  daysLeft: number | null;
}

// Returns the furthest-out scheduled session date for an athlete (or
// their most recent past session if nothing's upcoming) and how many
// days remain until that date. Ported from the prototype's
// programmeStatus, which drives the programme expiry dashboard.
export function programmeStatus(athleteDates: string[], today = todayISO()): ProgrammeStatus {
  if (!athleteDates.length) return { lastDate: null, daysLeft: null };
  const future = athleteDates.filter((d) => d >= today).sort();
  if (future.length) {
    const lastDate = future[future.length - 1];
    return { lastDate, daysLeft: daysBetween(today, lastDate) };
  }
  const past = [...athleteDates].sort();
  const lastDate = past[past.length - 1];
  return { lastDate, daysLeft: daysBetween(today, lastDate) }; // negative = already passed
}

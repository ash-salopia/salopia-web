// When the in-progress week's reflection opens (shared by the athlete app
// and the reflections API so they always agree):
//   - on the day of the week's LAST coach-programmed session (e.g. Friday),
//   - or straight away once that last session has been logged,
//   - Saturday if nothing was programmed that week.
// Past weeks are always open; future weeks never are (callers handle that).

export interface ReflectionSessionLike {
  date: string;
  session_source?: string | null;
  is_primer?: boolean | null;
  rpe?: number | null;
  exercises?: { log?: { done?: boolean }[] | null }[] | null;
  session_exercises?: { log?: { done?: boolean }[] | null }[] | null;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function logged(s: ReflectionSessionLike): boolean {
  if (s.rpe != null) return true;
  const exs = s.exercises ?? s.session_exercises ?? [];
  return exs.some((e) => (e.log ?? []).some((l) => l?.done));
}

export function reflectionWindow(sessions: ReflectionSessionLike[], weekStart: string, today: string): { opensOn: string; open: boolean; reason: "last_session" | "saturday" } {
  const weekEnd = addDays(weekStart, 6);
  const programmed = sessions
    .filter((s) => s.date >= weekStart && s.date <= weekEnd && s.session_source === "programme" && !s.is_primer)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!programmed.length) {
    const sat = addDays(weekStart, 5);
    return { opensOn: sat, open: today >= sat, reason: "saturday" };
  }
  const lastDate = programmed[programmed.length - 1].date;
  const lastDone = programmed.filter((s) => s.date === lastDate).every(logged);
  return { opensOn: lastDate, open: today >= lastDate || lastDone, reason: "last_session" };
}

export function opensLabel(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
}

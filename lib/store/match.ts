// Programme Store filters + "Find your ideal programme" (0131). Pure
// functions, no AI: each listed programme says who it's for (ages,
// level, equipment it needs, goals, "suitable for" tags) and a buyer's
// answers are scored against that. Labels live here so wording can
// change without a migration - the database only stores the keys.

export type Level = "beginner" | "intermediate" | "advanced";

export const LEVELS: { key: Level; label: string }[] = [
  { key: "beginner", label: "Beginner" },
  { key: "intermediate", label: "Intermediate" },
  { key: "advanced", label: "Advanced" },
];

// What a programme NEEDS. "none" = bodyweight only, fits everyone.
export const EQUIPMENT: { key: string; label: string }[] = [
  { key: "none", label: "No equipment" },
  { key: "bands", label: "Resistance bands" },
  { key: "dumbbells", label: "Dumbbells" },
  { key: "kettlebells", label: "Kettlebells" },
  { key: "barbell", label: "Barbell, rack & bench" },
  { key: "gym", label: "Full gym (machines & cables)" },
];

export const GOALS: { key: string; label: string }[] = [
  { key: "strength", label: "Get stronger" },
  { key: "muscle", label: "Build muscle" },
  { key: "power", label: "Speed & power" },
  { key: "fitness", label: "Fitness & conditioning" },
  { key: "weight", label: "Lose weight & get fitter" },
  { key: "sport", label: "Sport performance" },
  { key: "rehab", label: "Injury rehab & return to sport" },
  { key: "mobility", label: "Mobility & movement" },
];

// "Suitable for" - matched against a buyer's injuries / preferences.
export const TAGS: { key: string; label: string; issue: string }[] = [
  { key: "back", label: "Back friendly", issue: "Back pain or back issues" },
  { key: "knee", label: "Knee friendly", issue: "Knee pain or knee issues" },
  { key: "shoulder", label: "Shoulder friendly", issue: "Shoulder pain or shoulder issues" },
  { key: "low_impact", label: "Low impact", issue: "I'd prefer low impact (no jumping or running)" },
];

const labelOf = (list: { key: string; label: string }[], key: string) => list.find((x) => x.key === key)?.label ?? key;
export const equipmentLabel = (k: string) => labelOf(EQUIPMENT, k);
export const goalLabel = (k: string) => labelOf(GOALS, k);
export const tagLabel = (k: string) => labelOf(TAGS, k);
export const levelLabel = (k: string) => labelOf(LEVELS, k);

export interface MatchableProduct {
  ageMin: number | null;
  ageMax: number | null;
  level: Level | null;
  equipment: string[];
  goals: string[];
  tags: string[];
  daysPerWeek: number | null;
}

export function ageRangeLabel(p: Pick<MatchableProduct, "ageMin" | "ageMax">): string | null {
  if (p.ageMin != null && p.ageMax != null) return `Ages ${p.ageMin}-${p.ageMax}`;
  if (p.ageMin != null) return `Ages ${p.ageMin}+`;
  if (p.ageMax != null) return `Up to age ${p.ageMax}`;
  return null;
}

// Equipment the buyer has covers what the programme needs. A full gym
// covers everything; bodyweight programmes need nothing.
export function missingEquipment(needed: string[], have: string[]): string[] {
  if (have.includes("gym")) return [];
  return needed.filter((k) => k !== "none" && !have.includes(k));
}

export function ageFits(p: Pick<MatchableProduct, "ageMin" | "ageMax">, age: number | null): boolean {
  if (age == null) return true;
  return (p.ageMin == null || age >= p.ageMin) && (p.ageMax == null || age <= p.ageMax);
}

export interface FinderAnswers {
  age: number | null;
  goal: string | null;
  equipment: string[]; // what they have
  issues: string[]; // TAGS keys they need
  level: Level | null;
  days: number | null; // sessions a week they can do
}

export interface MatchResult {
  fits: boolean; // passes the hard checks (age, equipment)
  score: number;
  reasons: string[]; // shown as ticks
  warnings: string[]; // shown as cautions
}

const LEVEL_RANK: Record<Level, number> = { beginner: 0, intermediate: 1, advanced: 2 };

export function matchProgramme(p: MatchableProduct, a: FinderAnswers): MatchResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let fits = true;
  let score = 0;

  if (!ageFits(p, a.age)) {
    fits = false;
    warnings.push(ageRangeLabel(p) ?? "Not for your age");
  }

  // Equipment question skipped = don't rule anything out on equipment.
  // ("Nothing - bodyweight only" is an answer: ["none"].)
  const missing = a.equipment.length ? missingEquipment(p.equipment, a.equipment) : [];
  if (missing.length) {
    fits = false;
    warnings.push(`Needs ${missing.map((k) => equipmentLabel(k).toLowerCase()).join(", ")}`);
  } else if (p.equipment.length && a.equipment.length) {
    reasons.push(p.equipment.every((k) => k === "none") ? "No equipment needed" : "Works with the equipment you have");
    score += 1;
  }

  if (a.goal) {
    if (p.goals.includes(a.goal)) {
      reasons.push(`Matches your goal: ${goalLabel(a.goal).toLowerCase()}`);
      score += 4;
    }
  }

  for (const issue of a.issues) {
    if (p.tags.includes(issue)) {
      reasons.push(tagLabel(issue));
      score += 3;
    } else {
      warnings.push(`Not marked ${tagLabel(issue).toLowerCase()}`);
      score -= 3;
    }
  }

  if (a.level && p.level) {
    const gap = LEVEL_RANK[p.level] - LEVEL_RANK[a.level];
    if (gap === 0) {
      reasons.push(`${levelLabel(p.level)} level`);
      score += 2;
    } else if (gap >= 2) {
      warnings.push(`${levelLabel(p.level)} programme`);
      score -= 2;
    } else if (gap === 1) {
      score -= 1;
    }
  }

  if (a.days && p.daysPerWeek) {
    const diff = Math.abs(p.daysPerWeek - a.days);
    if (diff <= 0.5) {
      reasons.push(`About ${Math.round(p.daysPerWeek)} sessions a week`);
      score += 1;
    } else if (p.daysPerWeek > a.days + 1) {
      warnings.push(`About ${Math.round(p.daysPerWeek)} sessions a week`);
      score -= 1;
    }
  }

  return { fits, score, reasons, warnings };
}

// Best first: programmes that fit, by score; then the ones that don't.
export function rankProgrammes<T extends MatchableProduct>(products: T[], a: FinderAnswers): { product: T; match: MatchResult }[] {
  return products
    .map((product, i) => ({ product, match: matchProgramme(product, a), i }))
    .sort((x, y) => Number(y.match.fits) - Number(x.match.fits) || y.match.score - x.match.score || x.i - y.i)
    .map(({ product, match }) => ({ product, match }));
}

export function hasAttributes(p: MatchableProduct): boolean {
  return p.ageMin != null || p.ageMax != null || !!p.level || p.equipment.length > 0 || p.goals.length > 0 || p.tags.length > 0;
}

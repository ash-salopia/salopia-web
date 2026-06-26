// Session check-in / readiness questionnaire.
// Rules are configurable per-org via settings.

export interface CheckInAnswers {
  energy: number;   // 1-5, low=very low, high=excellent
  sleep: number;    // 1-5, low=very poor, high=very well
  soreness: number; // 1-5, low=none, high=very sore
  volume: number;   // 1-5, low=much less, high=much more
}

export const CHECKIN_QUESTIONS: {
  key: keyof CheckInAnswers;
  label: string;
  low: string;
  high: string;
}[] = [
  { key: "energy",   label: "Energy levels today?",                  low: "Very low",   high: "Excellent"   },
  { key: "sleep",    label: "How did you sleep last night?",          low: "Very poor",  high: "Very well"   },
  { key: "soreness", label: "Muscle soreness right now?",             low: "None",       high: "Very sore"   },
  { key: "volume",   label: "Training volume this week vs normal?",   low: "Much less",  high: "Much more"   },
];

export type SuggestionType = "warn" | "info" | "good" | "swap";

export interface Suggestion {
  type: SuggestionType;
  text: string;
}

export interface CheckInResult {
  avg: number;
  suggestions: Suggestion[];
}

// ── Action types ──────────────────────────────────────────────────────────────

export type CheckInAction =
  | "proceed"
  | "reduce_10"
  | "reduce_20"
  | "maintenance_mode"    // increase reps, lower weight — reduces CNS stress
  | "skip_sore_muscles"   // skip/modify exercises targeting sore muscles
  | "postpone"            // postpone session to later in the week
  | "skip"                // skip entire session
  | "custom";             // use coach-written custom text

// ── Rules ─────────────────────────────────────────────────────────────────────

export interface CheckInRules {
  low_energy: CheckInAction;
  poor_sleep: CheckInAction;
  high_soreness: CheckInAction;
  high_soreness_also?: "postpone" | "skip_sore_muscles" | "";  // second action for soreness
  high_volume: CheckInAction;
  // Custom text overrides for any action set to "custom"
  custom_low_energy?: string;
  custom_poor_sleep?: string;
  custom_high_soreness?: string;
  custom_high_volume?: string;
  // Extra coach-written rules shown on top of standard suggestions
  extra_rules?: Array<{ label: string; text: string }>;
}

export const DEFAULT_CHECKIN_RULES: CheckInRules = {
  low_energy: "maintenance_mode",
  poor_sleep: "reduce_20",
  high_soreness: "skip_sore_muscles",
  high_soreness_also: "postpone",
  high_volume: "reduce_10",
};

export const CHECKIN_RULE_OPTIONS: { value: CheckInAction; label: string; description: string }[] = [
  { value: "proceed",           label: "Proceed normally",              description: "Train as planned" },
  { value: "maintenance_mode",  label: "Maintenance mode",              description: "Perform 8-12+ reps / reduce load as needed — reduces CNS demand, maintains muscle strength/size" },
  { value: "reduce_10",         label: "Reduce load 10%",               description: "Slight reduction — train within yourself" },
  { value: "reduce_20",         label: "Reduce load 20%",               description: "Meaningful reduction — avoid max-effort sets" },
  { value: "skip_sore_muscles", label: "Skip sore muscle exercises",    description: "Modify or skip exercises targeting sore muscle groups" },
  { value: "postpone",          label: "Postpone to later in week",     description: "Move session to a later slot when recovery improves" },
  { value: "skip",              label: "Skip sore muscles or entire session", description: "Skip exercises targeting sore muscles, or skip the session entirely if soreness is severe" },
  { value: "custom",            label: "Custom message",                 description: "Write your own recommendation for athletes" },
];

export const CHECKIN_CONDITIONS: {
  key: keyof Pick<CheckInRules, "low_energy" | "poor_sleep" | "high_soreness" | "high_volume">;
  label: string;
  description: string;
  customKey: keyof Pick<CheckInRules, "custom_low_energy" | "custom_poor_sleep" | "custom_high_soreness" | "custom_high_volume">;
}[] = [
  { key: "low_energy",    label: "Low energy",    description: "Energy score 1-2 out of 5",   customKey: "custom_low_energy"    },
  { key: "poor_sleep",    label: "Poor sleep",    description: "Sleep score 1-2 out of 5",    customKey: "custom_poor_sleep"    },
  { key: "high_soreness", label: "High soreness", description: "Soreness score 4-5 out of 5", customKey: "custom_high_soreness" },
  { key: "high_volume",   label: "High volume",   description: "Volume score 4-5 out of 5",   customKey: "custom_high_volume"   },
];

// ── Action → suggestion text ──────────────────────────────────────────────────

function actionToSuggestion(action: CheckInAction, condition: string, customText?: string): Suggestion {
  switch (action) {
    case "maintenance_mode":
      return { type: "info", text: `${condition} — switch to maintenance mode: reduce weight by 20-30% and increase reps to 12-15. This keeps muscle fibres working without taxing your CNS.` };
    case "skip_sore_muscles":
      return { type: "warn", text: `${condition} — skip or modify exercises targeting your sore muscle groups today. Focus on less-affected areas or use lighter movement to aid recovery.` };
    case "postpone":
      return { type: "warn", text: `${condition} — consider postponing this session to later in the week when you have had more time to recover.` };
    case "skip":
      return { type: "warn", text: `${condition} — consider skipping today's session entirely and prioritising rest and recovery.` };
    case "reduce_20":
      return { type: "warn", text: `${condition} — reduce load by 20% and avoid max-effort sets today.` };
    case "reduce_10":
      return { type: "info", text: `${condition} — reduce load by 10% and train within yourself.` };
    case "custom":
      return { type: "info", text: customText || `${condition} — speak to your coach before starting today's session.` };
    case "proceed":
    default:
      return { type: "info", text: `${condition} — train as planned and listen to your body.` };
  }
}

// ── Scoring ───────────────────────────────────────────────────────────────────

export function scoreCheckIn(
  answers: CheckInAnswers,
  rules: CheckInRules = DEFAULT_CHECKIN_RULES
): CheckInResult {
  const { energy = 3, soreness = 3, volume = 3, sleep = 3 } = answers;
  const suggestions: Suggestion[] = [];

  if (energy <= 2 && rules.low_energy !== "proceed") {
    suggestions.push(actionToSuggestion(rules.low_energy, "Low energy today", rules.custom_low_energy));
  }
  if (sleep <= 2 && rules.poor_sleep !== "proceed") {
    suggestions.push(actionToSuggestion(rules.poor_sleep, "Poor sleep last night", rules.custom_poor_sleep));
  }
  if (soreness >= 4 && rules.high_soreness !== "proceed") {
    suggestions.push(actionToSuggestion(rules.high_soreness, "High muscle soreness", rules.custom_high_soreness));
    // Secondary soreness action
    if (rules.high_soreness_also && rules.high_soreness_also !== rules.high_soreness) {
      suggestions.push(actionToSuggestion(rules.high_soreness_also as CheckInAction, "High muscle soreness (additional)"));
    }
  }
  if (volume >= 4 && rules.high_volume !== "proceed") {
    suggestions.push(actionToSuggestion(rules.high_volume, "High training volume this week", rules.custom_high_volume));
  }

  // Extra coach-written rules
  if (rules.extra_rules?.length) {
    for (const rule of rules.extra_rules) {
      suggestions.push({ type: "info", text: rule.text });
    }
  }

  const avg = (energy + (6 - soreness) + (6 - volume) + sleep) / 4;
  if (avg >= 4.2) {
    suggestions.push({ type: "good", text: "You are feeling great — a good day to push intensity or test a new personal best." });
  }
  if (!suggestions.length) {
    suggestions.push({ type: "info", text: "You are in a good place — train as planned and listen to your body." });
  }

  return { avg, suggestions };
}

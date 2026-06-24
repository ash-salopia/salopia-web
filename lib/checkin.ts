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

// ── Configurable rules ────────────────────────────────────────────────────────

export type CheckInAction = "proceed" | "reduce_10" | "reduce_20" | "skip";

export interface CheckInRules {
  low_energy: CheckInAction;      // energy <= 2
  poor_sleep: CheckInAction;      // sleep <= 2
  high_soreness: CheckInAction;   // soreness >= 4
  high_volume: CheckInAction;     // volume >= 4
}

export const DEFAULT_CHECKIN_RULES: CheckInRules = {
  low_energy: "reduce_20",
  poor_sleep: "reduce_20",
  high_soreness: "skip",
  high_volume: "reduce_10",
};

export const CHECKIN_RULE_OPTIONS: { value: CheckInAction; label: string }[] = [
  { value: "proceed",    label: "Proceed normally"   },
  { value: "reduce_10",  label: "Reduce load 10%"    },
  { value: "reduce_20",  label: "Reduce load 20%"    },
  { value: "skip",       label: "Skip session"        },
];

export const CHECKIN_CONDITIONS: { key: keyof CheckInRules; label: string; description: string }[] = [
  { key: "low_energy",    label: "Low energy",     description: "Energy score 1-2 out of 5"  },
  { key: "poor_sleep",    label: "Poor sleep",     description: "Sleep score 1-2 out of 5"   },
  { key: "high_soreness", label: "High soreness",  description: "Soreness score 4-5 out of 5" },
  { key: "high_volume",   label: "High volume",    description: "Volume score 4-5 out of 5"  },
];

function actionToSuggestion(action: CheckInAction, condition: string): Suggestion {
  switch (action) {
    case "skip":
      return { type: "warn", text: `${condition} - consider skipping today's session and resting.` };
    case "reduce_20":
      return { type: "warn", text: `${condition} - reduce load by 20% and avoid max-effort sets today.` };
    case "reduce_10":
      return { type: "info", text: `${condition} - reduce load by 10% and train within yourself.` };
    case "proceed":
    default:
      return { type: "info", text: `${condition} - train as planned and listen to your body.` };
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
    suggestions.push(actionToSuggestion(rules.low_energy, "Low energy today"));
  }
  if (sleep <= 2 && rules.poor_sleep !== "proceed") {
    suggestions.push(actionToSuggestion(rules.poor_sleep, "Poor sleep last night"));
  }
  if (soreness >= 4 && rules.high_soreness !== "proceed") {
    suggestions.push(actionToSuggestion(rules.high_soreness, "High muscle soreness"));
  }
  if (volume >= 4 && rules.high_volume !== "proceed") {
    suggestions.push(actionToSuggestion(rules.high_volume, "High training volume this week"));
  }

  const avg = (energy + (6 - soreness) + (6 - volume) + sleep) / 4;
  if (avg >= 4.2) {
    suggestions.push({ type: "good", text: "You are feeling great - a good day to push intensity or test a new personal best." });
  }
  if (!suggestions.length) {
    suggestions.push({ type: "info", text: "You are in a good place - train as planned and listen to your body." });
  }

  return { avg, suggestions };
}

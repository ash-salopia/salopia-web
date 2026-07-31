import type { RecoveryCategory, RecoveryIntensity, Session } from "@/types";

export const RECOVERY_CATEGORIES: { value: RecoveryCategory; label: string }[] = [
  { value: "mobility", label: "Mobility" },
  { value: "soft_tissue", label: "Foam rolling / soft-tissue work" },
  { value: "active_recovery", label: "Active recovery" },
  { value: "breathing_relaxation", label: "Breathing & relaxation" },
  { value: "sleep", label: "Sleep" },
  { value: "nutrition_hydration", label: "Nutrition & hydration" },
  { value: "sauna_cold_exposure", label: "Sauna / cold exposure" },
  { value: "post_event", label: "Post-event recovery" },
  { value: "travel", label: "Travel recovery" },
  { value: "rest_day", label: "Rest day" },
  { value: "rehab_prehab", label: "Rehabilitation / prehabilitation" },
  { value: "custom", label: "Custom" },
];

export function recoveryCategoryLabel(category: RecoveryCategory | null, customLabel?: string): string {
  if (category === "custom") return customLabel?.trim() || "Custom";
  return RECOVERY_CATEGORIES.find((c) => c.value === category)?.label ?? "Recovery";
}

export const RECOVERY_INTENSITIES: { value: RecoveryIntensity; label: string }[] = [
  { value: "very_low", label: "Very low" },
  { value: "low", label: "Low" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" },
];

export const RECOVERY_COLOR = "#2DD4BF";

// One line of calendar-card summary info for a Recovery session —
// category, duration, activity/checklist-item count, and whether
// feedback is requested. Used by every card renderer (coach week/
// month view, athlete-facing week/month view) so they all stay in
// sync as new recovery_format values land in later phases, rather
// than each hand-rolling this from the raw config shape.
export function recoverySessionCardLine(session: Session): string {
  const config = session.recovery_config ?? {};
  const parts: string[] = [recoveryCategoryLabel(session.recovery_category, config.custom_category_label)];
  if (config.duration_minutes != null) parts.push(`${config.duration_minutes} min`);
  const itemCount = (config.blocks?.length ?? 0) + (config.checklist_items?.length ?? 0);
  if (itemCount > 0) parts.push(`${itemCount} ${itemCount === 1 ? "item" : "items"}`);
  if (config.request_feedback) parts.push("📋 feedback");
  return parts.join(" · ");
}

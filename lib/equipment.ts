// Fixed equipment list for Home Programme exercise tags and their
// alternatives (0058). Picked from a list rather than typed so tags
// always match up on the public /g/<code> page - "Dumbbells" vs
// "dumbbell" would otherwise never swap. Stored as the label itself
// (existing data is plain text), so wording here is what viewers see.
export const HOME_EQUIPMENT = [
  "Bodyweight",
  "Resistance bands",
  "Dumbbells",
  "Kettlebells",
  "Barbell",
  "Pull-up bar",
  "Bench",
  "Medicine ball",
  "Cardio machine",
  "Full gym",
] as const;

// Options for a tag picker: the fixed list, plus whatever was saved
// before the list existed, so an old free-text tag is never lost.
export function equipmentOptions(current?: string | null): string[] {
  const list: string[] = [...HOME_EQUIPMENT];
  if (current && !list.includes(current)) list.push(current);
  return list;
}

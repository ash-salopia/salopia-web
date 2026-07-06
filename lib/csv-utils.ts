// Looks up a value across several possible column-header spellings,
// case-insensitively. Shared by every CSV importer in the app so the
// header-matching behaviour stays identical across features.
export function pickCsvField(row: Record<string, string>, keys: readonly string[]): string {
  for (const k of Object.keys(row)) {
    if (keys.includes(k.trim().toLowerCase())) return (row[k] ?? "").trim();
  }
  return "";
}

import Papa from "papaparse";
import { saveLibraryEntry, findLibraryEntryByName } from "@/lib/data/library";
import { pickCsvField } from "@/lib/csv-utils";
import type { LibraryEntry } from "@/types";

const LIBRARY_HEADER_MAP = {
  name: ["name", "exercise", "movement"],
  types: ["types", "type", "category"],
  video_url: ["video url", "videourl", "video", "url"],
  sets: ["sets", "set"],
  reps: ["reps", "rep"],
  time: ["time", "duration", "hold"],
  rest: ["rest", "recovery"],
  target_load: ["load", "weight", "target load", "default load"],
  tempo: ["tempo"],
  notes: ["notes", "note", "cue"],
} as const;

type LibraryField = keyof typeof LIBRARY_HEADER_MAP;

function pickLibraryField(row: Record<string, string>, field: LibraryField): string {
  return pickCsvField(row, LIBRARY_HEADER_MAP[field]);
}

export interface LibraryCsvImportResult {
  imported: number;
  created: number;
  updated: number;
  skipped: number;
}

// Bulk-loads exercises into the library from a CSV. Each row upserts
// by name (case-insensitive) — re-importing the same file is safe
// and just refreshes existing entries rather than creating
// duplicates. Expected columns (case-insensitive, several spellings
// accepted per column — see LIBRARY_HEADER_MAP above): Name, Types,
// Video URL, Sets, Reps, Time, Rest, Load, Tempo, Notes. Only Name is
// required; everything else is optional per row.
export async function importLibraryCsv(file: File): Promise<LibraryCsvImportResult> {
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length) {
    throw new Error("Could not read that CSV — check it's a valid, comma-separated file.");
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of parsed.data) {
    const name = pickLibraryField(row, "name");
    if (!name) {
      skipped++;
      continue;
    }

    const typesRaw = pickLibraryField(row, "types");
    const types = typesRaw
      ? typesRaw
          .split(/[,;]/)
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
      : [];

    // Check existence BEFORE saving, since saveLibraryEntry's own
    // upsert logic doesn't report back whether it created or updated
    // — we want that distinction for the import summary shown to the
    // coach afterward.
    const existing = await findLibraryEntryByName(name);

    const entry: Partial<LibraryEntry> & { name: string } = {
      name,
      types,
      video_url: pickLibraryField(row, "video_url"),
      sets: pickLibraryField(row, "sets"),
      reps: pickLibraryField(row, "reps"),
      time: pickLibraryField(row, "time"),
      rest: pickLibraryField(row, "rest"),
      target_load: pickLibraryField(row, "target_load"),
      tempo: pickLibraryField(row, "tempo") || "2-0-2",
      notes: pickLibraryField(row, "notes"),
    };

    await saveLibraryEntry(entry);
    if (existing) updated++;
    else created++;
  }

  return { imported: created + updated, created, updated, skipped };
}

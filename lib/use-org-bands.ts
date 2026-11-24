"use client";

// The coach's band set (Settings -> Bands) for the exercise editor's band
// picker. Fetched once per page load and shared by every exercise card.

import { useEffect, useState } from "react";
import { getOrgSettings } from "@/lib/data/settings";
import { DEFAULT_BANDS, bandsFrom, type Band } from "@/lib/bands";

let cached: Promise<Band[]> | null = null;

export function useOrgBands(): Band[] {
  const [bands, setBands] = useState<Band[]>(DEFAULT_BANDS);
  useEffect(() => {
    cached ??= getOrgSettings().then(bandsFrom).catch(() => DEFAULT_BANDS);
    let live = true;
    cached.then((b) => live && setBands(b));
    return () => { live = false; };
  }, []);
  return bands;
}

/** Call after the band set is edited so the next card picks it up. */
export function resetOrgBandsCache() {
  cached = null;
}

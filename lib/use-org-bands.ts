"use client";

// Org settings the exercise editor and Live group need on every card -
// the band set (Settings -> Gym equipment -> bands) and the gym weight
// steps (load_increments). Fetched once per page load and shared.

import { useEffect, useState } from "react";
import { getOrgSettings, type OrgSettings } from "@/lib/data/settings";
import { DEFAULT_BANDS, bandsFrom, type Band } from "@/lib/bands";
import type { LoadIncrements } from "@/lib/load-increments";

let cached: Promise<OrgSettings | null> | null = null;
const settings = () => (cached ??= getOrgSettings().catch(() => null));

export function useOrgBands(): Band[] {
  const [bands, setBands] = useState<Band[]>(DEFAULT_BANDS);
  useEffect(() => {
    let live = true;
    settings().then((st) => live && setBands(bandsFrom(st)));
    return () => { live = false; };
  }, []);
  return bands;
}

/** The coach's default gym weight steps (unresolved - pass to resolveIncrements). */
export function useOrgIncrements(): Partial<LoadIncrements> | null {
  const [inc, setInc] = useState<Partial<LoadIncrements> | null>(null);
  useEffect(() => {
    let live = true;
    settings().then((st) => live && setInc(st?.load_increments ?? null));
    return () => { live = false; };
  }, []);
  return inc;
}

/** Call after bands / gym weights are edited so the next page picks them up. */
export function resetOrgBandsCache() {
  cached = null;
}

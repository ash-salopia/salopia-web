// 0088 — return-to-play / availability status constants + helpers.
// Pure, no imports — safe to use on both surfaces.

import type { RtpStatus } from "@/types";

export const RTP_STATUSES: { value: RtpStatus; label: string; color: string; short: string }[] = [
  { value: "available", label: "Available", color: "#22C55E", short: "OK" },
  { value: "modified", label: "Modified training", color: "#EAB308", short: "Mod" },
  { value: "rehab", label: "Rehab", color: "#F97316", short: "Rehab" },
  { value: "return_to_play", label: "Return to play", color: "#3B82F6", short: "RTP" },
  { value: "unavailable", label: "Unavailable", color: "#EF4444", short: "Out" },
];

const FALLBACK = RTP_STATUSES[0];

export function rtpMeta(status: string | null | undefined) {
  return RTP_STATUSES.find((s) => s.value === status) ?? FALLBACK;
}

export function isAvailable(status: string | null | undefined): boolean {
  return !status || status === "available";
}

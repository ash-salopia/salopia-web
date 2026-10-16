import type { MessageReaction } from "@/types";

// 👍/👎 quick replies on direct messages (0117). Plain module (no
// "use client") so server routes can share these with the UI.

export const REACTION_EMOJI: Record<MessageReaction, string> = { up: "👍", down: "👎" };

/** Short text for push notifications: `"can I switch…"` */
export function quoteForPush(body: string, audio: boolean): string {
  if (audio) return "your voice note";
  const t = body.trim().replace(/\s+/g, " ");
  return `"${t.length > 80 ? t.slice(0, 77) + "…" : t}"`;
}

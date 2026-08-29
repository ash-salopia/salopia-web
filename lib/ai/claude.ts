// Single place every AI route calls Claude through. Model IDs live here
// and nowhere else — moving a route between models is a one-line change
// after a spot-check.
//
// Model split (see the AI cost pass):
//  - sonnet-5  → showcase / accuracy-critical routes (training report
//    summary, session "Modify" AI, voice/notes parsing). Cheaper AND
//    more capable than the old sonnet-4-6, and faster.
//  - haiku-4-5 → high-volume plumbing that's only glanced at (per-session
//    recap, tiny structured parses). ~1/3 the cost, fastest model.
//
// Raw fetch (not the SDK) to match the rest of the codebase; no
// temperature/thinking/budget params (sonnet-5 rejects those anyway).

export const AI_MODEL = {
  report: "claude-sonnet-5", // training-report-ai
  edit: "claude-sonnet-5", // session-modify
  parse: "claude-sonnet-5", // notes-parse, voice-parse, programme-assign-parse
} as const;
// Everything is on Sonnet 5 — cheaper ($2/$10 vs the old 4-6's $3/$15),
// faster, and at least as capable, so it's a strict win with no quality
// tradeoff. Haiku 4-5 (~⅓ the cost, fastest) is a one-line switch for
// any route later — but it occasionally fumbles numeric detail (rep
// counts, "next Monday" dates), and every route here is either
// coach-facing prose or accuracy-critical parsing, so Sonnet stays. The
// per-session "vs last time" view is now plain data (no AI) — see
// components/SessionProgressModal.tsx + lib/session-progress.ts.

export type AiModel = (typeof AI_MODEL)[keyof typeof AI_MODEL];

// content is usually a string; notes-parse passes document/image blocks.
type Msg = { role: "user" | "assistant"; content: string | Array<Record<string, unknown>> };

interface CallOpts {
  model: AiModel;
  system: string;
  maxTokens: number;
  /** Single-turn convenience; ignored if `messages` is given. */
  prompt?: string;
  /** Multi-turn (voice-parse etc.). */
  messages?: Msg[];
  signal?: AbortSignal;
}

export type CallResult = { ok: true; text: string } | { ok: false; status: number; error: string };

const ENDPOINT = "https://api.anthropic.com/v1/messages";

function buildBody(o: CallOpts, stream: boolean) {
  return {
    model: o.model,
    max_tokens: o.maxTokens,
    // Cache-control marker kept on the system block: a no-op below the
    // model's cacheable-prefix minimum, self-activating for free above it.
    system: [{ type: "text", text: o.system, cache_control: { type: "ephemeral" as const } }],
    messages: o.messages ?? [{ role: "user" as const, content: o.prompt ?? "" }],
    ...(stream ? { stream: true } : {}),
  };
}

function headers(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
    "anthropic-version": "2023-06-01",
  };
}

/** Non-streaming call — returns the assistant's text (or a typed error). */
export async function callClaude(o: CallOpts): Promise<CallResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, status: 500, error: "ANTHROPIC_API_KEY not set" };
  }
  let res: Response;
  try {
    res = await fetch(ENDPOINT, { method: "POST", headers: headers(), body: JSON.stringify(buildBody(o, false)), signal: o.signal });
  } catch {
    return { ok: false, status: 502, error: "Could not reach AI service" };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, status: 502, error: `AI request failed (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}` };
  }
  const data = await res.json().catch(() => null);
  const text: string = data?.content?.[0]?.text ?? "";
  return { ok: true, text };
}

/**
 * Streaming call — returns the upstream Anthropic SSE Response for the
 * route to pass straight through to the browser. Caller sets its own
 * headers on the outgoing Response.
 */
export async function streamClaude(o: CallOpts): Promise<{ ok: true; body: ReadableStream<Uint8Array> } | { ok: false; status: number; error: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, status: 500, error: "ANTHROPIC_API_KEY not set" };
  }
  let res: Response;
  try {
    res = await fetch(ENDPOINT, { method: "POST", headers: headers(), body: JSON.stringify(buildBody(o, true)), signal: o.signal });
  } catch {
    return { ok: false, status: 502, error: "Could not reach AI service" };
  }
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    return { ok: false, status: 502, error: `AI request failed (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}` };
  }
  return { ok: true, body: res.body };
}

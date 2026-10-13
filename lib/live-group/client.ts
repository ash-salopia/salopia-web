"use client";

import { useEffect, useState } from "react";

// Live Group's browser side: this device's id/label, and an ordered
// offline save queue for every Live Group write.
//
// Why a separate queue from lib/save-queue.ts (the athlete app's): Live
// Group saves must reach the server IN ORDER (set 2's reps before
// "done"), and a save can be refused because this device lost control
// of Live Group, which needs its own handling. Keeping it separate also
// means none of this can change how athlete saves behave.
//
// Every queued save carries loggedAt — when the coach actually made the
// change. The server accepts it if this device was in control at that
// moment (0113 live_group_can_write), so sets logged offline before a
// take-over still save once the device reconnects.

// ── Device identity ─────────────────────────────────────────────────────────

const DEVICE_KEY = "liveGroup_deviceId";

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    // Storage blocked (private mode): a per-page-load id still works,
    // the device just counts as new each time the page loads.
    const w = window as unknown as { __liveGroupDeviceId?: string };
    w.__liveGroupDeviceId ??= crypto.randomUUID();
    return w.__liveGroupDeviceId;
  }
}

export function getDeviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/CrOS/.test(ua)) return "Chromebook";
  if (/Linux/.test(ua)) return "Linux PC";
  return "device";
}

// ── Ordered save queue ──────────────────────────────────────────────────────

export type LiveOp =
  | { kind: "patchSet"; exerciseId: string; setIndex: number; patch: Record<string, unknown> }
  | { kind: "appendSet"; exerciseId: string; expectedLength: number; set: Record<string, unknown> }
  | { kind: "removeLastSet"; exerciseId: string; expectedLength: number }
  | { kind: "replaceLog"; exerciseId: string; log: unknown[] }
  | { kind: "exercise"; exerciseId: string; patch: Record<string, unknown> }
  | { kind: "session"; sessionId: string; patch: Record<string, unknown> }
  | { kind: "addExercise"; sessionId: string; exercise: Record<string, unknown> };

interface QueuedOp {
  id: string;
  op: LiveOp;
  loggedAt: string;
  attempts: number;
}

export interface FailedOp {
  id: string;
  error: string;
  notActive: boolean; // refused because it was logged after this device lost control
}

const QUEUE_KEY = "liveGroup_queue_v1";
const FAILED_KEY = "liveGroup_failed_v1";
const RETRY_MS = 30_000;
const WRITE_URL = "/api/live-group/write";

function read<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
}
function write<T>(key: string, v: T[]) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full/blocked */ }
  emit();
}

type Listener = () => void;
const listeners = new Set<Listener>();
function emit() { listeners.forEach((fn) => fn()); }

// Called when the server says this device isn't in control any more.
let onNotActive: (() => void) | null = null;
export function setNotActiveHandler(fn: (() => void) | null) { onNotActive = fn; }

export type SendResult =
  | { ok: true; data: any }
  | { ok: false; queued: true }
  | { ok: false; queued: false; notActive: boolean; error: string };

async function post(item: QueuedOp): Promise<Response> {
  return fetch(WRITE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: getDeviceId(), loggedAt: item.loggedAt, op: item.op }),
    cache: "no-store",
  });
}

// Sends one Live Group write. If anything is already waiting in the
// queue, this goes to the back of it (order matters), otherwise it's
// sent now and only queued if the network fails.
export async function sendLiveOp(op: LiveOp): Promise<SendResult> {
  const item: QueuedOp = { id: crypto.randomUUID(), op, loggedAt: new Date().toISOString(), attempts: 0 };
  if (read<QueuedOp>(QUEUE_KEY).length) {
    write(QUEUE_KEY, [...read<QueuedOp>(QUEUE_KEY), item]);
    flushLiveQueue();
    return { ok: false, queued: true };
  }
  let res: Response;
  try { res = await post(item); }
  catch {
    write(QUEUE_KEY, [...read<QueuedOp>(QUEUE_KEY), item]);
    return { ok: false, queued: true };
  }
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, data: body };
  const notActive = body.code === "NOT_ACTIVE_DEVICE";
  if (notActive) onNotActive?.();
  return { ok: false, queued: false, notActive, error: body.error || "Could not save" };
}

let flushing: Promise<void> | null = null;

// Sends queued saves in order. Stops at the first network failure (the
// rest stay queued, still in order). A save the server refuses is moved
// to the failed list rather than silently dropped.
export function flushLiveQueue(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      while (true) {
        const [item] = read<QueuedOp>(QUEUE_KEY);
        if (!item) break;
        let res: Response;
        try { res = await post(item); }
        catch {
          write(QUEUE_KEY, read<QueuedOp>(QUEUE_KEY).map((q) => (q.id === item.id ? { ...q, attempts: q.attempts + 1 } : q)));
          break;
        }
        write(QUEUE_KEY, read<QueuedOp>(QUEUE_KEY).filter((q) => q.id !== item.id));
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const notActive = body.code === "NOT_ACTIVE_DEVICE";
          write(FAILED_KEY, [...read<FailedOp>(FAILED_KEY), { id: item.id, error: body.error || "Could not save", notActive }]);
          if (notActive) onNotActive?.();
        }
      }
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

// Keeps trying to empty the queue until it's empty or timeoutMs passes.
// Resolves with how many saves are still waiting.
export async function drainLiveQueue(timeoutMs: number): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (read<QueuedOp>(QUEUE_KEY).length && Date.now() < deadline) {
    await flushLiveQueue();
    if (!read<QueuedOp>(QUEUE_KEY).length) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return read<QueuedOp>(QUEUE_KEY).length;
}

export function clearLiveFailed() { write(FAILED_KEY, []); }

let initialised = false;
function initLiveQueue() {
  if (initialised || typeof window === "undefined") return;
  initialised = true;
  flushLiveQueue();
  setInterval(flushLiveQueue, RETRY_MS);
  window.addEventListener("online", () => { flushLiveQueue(); });
}

export function useLiveQueueStatus(): { pending: number; failed: FailedOp[] } {
  const [state, setState] = useState<{ pending: number; failed: FailedOp[] }>({ pending: 0, failed: [] });
  useEffect(() => {
    initLiveQueue();
    const update = () => setState({ pending: read<QueuedOp>(QUEUE_KEY).length, failed: read<FailedOp>(FAILED_KEY) });
    update();
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);
  return state;
}

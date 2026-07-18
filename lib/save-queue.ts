"use client";

import { useEffect, useState } from "react";

// Athlete-app save retry queue. A save that never reaches the server
// (dropped gym wifi, phone loses signal mid-set) is persisted to
// localStorage and retried every 30s + immediately on reconnect, rather
// than just failing silently. A save the server actively rejects (bad
// token, ownership check, validation) is NOT queued — retrying won't
// fix that — and is surfaced to the caller as a normal error instead.

interface QueuedSave {
  key: string;
  url: string;
  body: Record<string, unknown>;
  attempts: number;
  queuedAt: number;
}

const STORAGE_KEY = "athletiq_save_queue_v1";
const RETRY_INTERVAL_MS = 30_000;
const MAX_ATTEMPTS = 40; // ~20 min of periodic retries before giving up

type Listener = (pending: number) => void;
const listeners = new Set<Listener>();

function readQueue(): QueuedSave[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedSave[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // storage full/unavailable — nothing more we can do
  }
  listeners.forEach((fn) => fn(queue.length));
}

function enqueue(key: string, url: string, body: Record<string, unknown>) {
  // A newer save for the same target replaces any older queued attempt,
  // so a retry always sends the latest value rather than a stale one.
  const queue = readQueue().filter((q) => q.key !== key);
  queue.push({ key, url, body, attempts: 0, queuedAt: Date.now() });
  writeQueue(queue);
}

function dequeue(key: string, queuedAt: number) {
  writeQueue(readQueue().filter((q) => !(q.key === key && q.queuedAt === queuedAt)));
}

export function subscribeToSaveQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener(readQueue().length);
  return () => {
    listeners.delete(listener);
  };
}

export function pendingSaveCount(): number {
  return readQueue().length;
}

// Attempts a save immediately. Resolves { ok: true, data } on success
// (data is the parsed response body — e.g. the log route's { pb }),
// { ok: false, queued: true } if it was queued for automatic retry, or
// { ok: false, queued: false, error } if the server rejected it outright.
export async function saveWithRetry(
  key: string,
  url: string,
  body: Record<string, unknown>
): Promise<{ ok: true; data: any } | { ok: false; queued: true } | { ok: false; queued: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (res.ok) return { ok: true, data: await res.json().catch(() => ({})) };
    const errBody = await res.json().catch(() => ({}));
    return { ok: false, queued: false, error: errBody.error || "Could not save" };
  } catch {
    // fetch itself threw — a genuine network failure, not a server rejection
    enqueue(key, url, body);
    return { ok: false, queued: true };
  }
}

let flushing = false;

export async function flushSaveQueue() {
  if (flushing || typeof window === "undefined" || !navigator.onLine) return;
  flushing = true;
  try {
    for (const item of readQueue()) {
      try {
        await fetch(item.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.body),
          cache: "no-store",
        });
        // Whether the server accepted or actively rejected it, there's
        // nothing more retrying can do — either way, stop retrying.
        dequeue(item.key, item.queuedAt);
      } catch {
        // Still unreachable — leave it queued and bump the attempt count.
        const stillThere = readQueue().find((q) => q.key === item.key && q.queuedAt === item.queuedAt);
        if (stillThere) {
          if (stillThere.attempts + 1 >= MAX_ATTEMPTS) {
            dequeue(item.key, item.queuedAt);
          } else {
            writeQueue(
              readQueue().map((q) =>
                q.key === item.key && q.queuedAt === item.queuedAt ? { ...q, attempts: q.attempts + 1 } : q
              )
            );
          }
        }
      }
    }
  } finally {
    flushing = false;
  }
}

let initialized = false;

// Starts the periodic retry loop and the reconnect listener. Safe to
// call from multiple components — only wires up once per page load.
export function initSaveQueue() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  flushSaveQueue();
  setInterval(flushSaveQueue, RETRY_INTERVAL_MS);
  window.addEventListener("online", flushSaveQueue);
}

export function usePendingSaveCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    initSaveQueue();
    return subscribeToSaveQueue(setCount);
  }, []);
  return count;
}

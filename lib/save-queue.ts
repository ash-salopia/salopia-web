"use client";

import { useEffect, useState } from "react";

// Athlete-app save retry queue. A save that never reaches the server
// (dropped gym wifi, phone loses signal mid-set) is persisted to
// localStorage and retried every 30s + immediately on reconnect, rather
// than just failing silently. A save the server actively rejects on the
// FIRST attempt (bad token, ownership check, validation) is NOT queued
// — retrying won't fix that — and is surfaced to the caller as a normal
// error instead.
//
// Two things a real gym session needs that a "retry for a minute or
// two" queue doesn't cover, both fixed here:
//  1. No attempt ceiling for network failures. A session can run well
//     over an hour with patchy signal (basement gyms, poor carrier
//     coverage) - silently discarding logged sets after ~20 minutes
//     because the queue "gave up" would lose real training data with
//     no way for the athlete to know. Attempts are still counted (for
//     staleness/debugging) but never trigger deletion on their own -
//     an item only ever leaves the pending queue via success or an
//     explicit server rejection once reachable again.
//  2. A retried save that DOES reach the server but gets rejected (the
//     session was deleted while offline, an ownership check now fails,
//     etc.) used to be silently dequeued as if it had succeeded - the
//     athlete would believe the set saved when it didn't. Rejections
//     during retry now move to a separate `failed` list instead of
//     just vanishing, so the UI can tell the athlete plainly.

interface QueuedSave {
  key: string;
  url: string;
  body: Record<string, unknown>;
  attempts: number;
  queuedAt: number;
}

interface FailedSave {
  key: string;
  error: string;
  failedAt: number;
}

const STORAGE_KEY = "athletiq_save_queue_v1";
const FAILED_STORAGE_KEY = "athletiq_save_queue_failed_v1";
const RETRY_INTERVAL_MS = 30_000;

type Listener = (pending: number) => void;
const listeners = new Set<Listener>();
const failedListeners = new Set<Listener>();

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

function readFailed(): FailedSave[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FAILED_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeFailed(failed: FailedSave[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FAILED_STORAGE_KEY, JSON.stringify(failed));
  } catch {
    // storage full/unavailable — nothing more we can do
  }
  failedListeners.forEach((fn) => fn(failed.length));
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

function markFailed(key: string, error: string) {
  writeFailed([...readFailed().filter((f) => f.key !== key), { key, error, failedAt: Date.now() }]);
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

export function subscribeToFailedSaves(listener: Listener): () => void {
  failedListeners.add(listener);
  listener(readFailed().length);
  return () => {
    failedListeners.delete(listener);
  };
}

export function failedSaveCount(): number {
  return readFailed().length;
}

// Lets the UI dismiss failed saves once the athlete has acknowledged
// them (e.g. re-logged the set manually) - there's no automatic
// recovery path for a save the server actively rejected.
export function clearFailedSaves() {
  writeFailed([]);
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
        const res = await fetch(item.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.body),
          cache: "no-store",
        });
        dequeue(item.key, item.queuedAt);
        if (!res.ok) {
          // Reached the server, but it rejected the retry (e.g. the
          // session was deleted while offline) - retrying again won't
          // help, but silently dropping it would look like a success.
          const errBody = await res.json().catch(() => ({}));
          markFailed(item.key, errBody.error || "Could not save");
        }
      } catch {
        // Still unreachable - leave it queued and bump the attempt
        // count (informational only, no ceiling - see the module
        // comment on why this never gives up on its own).
        writeQueue(
          readQueue().map((q) =>
            q.key === item.key && q.queuedAt === item.queuedAt ? { ...q, attempts: q.attempts + 1 } : q
          )
        );
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

export function useFailedSaveCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    initSaveQueue();
    return subscribeToFailedSaves(setCount);
  }, []);
  return count;
}

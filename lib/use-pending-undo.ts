"use client";

import { useState, useCallback } from "react";

// Single-slot "undo the last destructive action" state, shared by the
// session/programme/template builders. Deliberately not a multi-level
// stack - restoring something from several edits back after positions
// have since shifted underneath it is a much harder problem than "I
// deleted the wrong thing, put it back" - and deliberately not
// persisted anywhere, so it resets on refresh/navigation same as any
// other in-memory React state (see the undo-button plan for why that's
// the right tradeoff here).
export interface PendingUndo {
  label: string;
  restore: () => Promise<void>;
}

export function usePendingUndo() {
  const [pending, setPending] = useState<PendingUndo | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState("");

  // Replaces whatever was pending - only the most recent destructive
  // action is ever recoverable.
  const push = useCallback((label: string, restore: () => Promise<void>) => {
    setError("");
    setPending({ label, restore });
  }, []);

  const clear = useCallback(() => {
    setPending(null);
    setError("");
  }, []);

  const runUndo = useCallback(async () => {
    if (!pending) return;
    setRestoring(true);
    setError("");
    try {
      await pending.restore();
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not undo");
    } finally {
      setRestoring(false);
    }
  }, [pending]);

  return { pending, push, clear, runUndo, restoring, error };
}

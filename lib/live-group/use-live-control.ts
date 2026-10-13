"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDeviceId, getDeviceLabel, drainLiveQueue, setNotActiveHandler } from "@/lib/live-group/client";

// Who controls Live Group on this device right now.
//
//   checking  — first claim in flight
//   active    — this device has control; inputs enabled
//   full      — the plan's device limit is reached; show the take-over modal
//   viewOnly  — coach chose "View only" from the modal
//   handover  — control was just lost; flushing queued saves before locking
//   displaced — control moved to another device; banner + Take back
//
// While /live is open and visible, an active device sends a heartbeat
// every 30s. The server counts a device as active if it was seen in the
// last 90s, so a closed or long-hidden tab drops off on its own.

export type ControlState = "checking" | "active" | "full" | "viewOnly" | "handover" | "displaced";

export interface OtherDevice {
  label: string;
  otherCoachName: string | null; // null = it's this coach's own device
}

interface DeviceResponse {
  status: "active" | "full" | "displaced";
  planName: string | null;
  maxDevices: number | null;
  upsell: string | null;
  activeDevices?: OtherDevice[];
  displacedBy?: OtherDevice;
}

const HEARTBEAT_MS = 30_000;
const HANDOVER_FLUSH_MS = 10_000;

export function describeDevice(d: OtherDevice): string {
  return d.otherCoachName ? `${d.otherCoachName}'s ${d.label}` : `your ${d.label}`;
}

export function useLiveControl() {
  const [state, setState] = useState<ControlState>("checking");
  const [others, setOthers] = useState<OtherDevice[]>([]);
  const [displacedBy, setDisplacedBy] = useState<OtherDevice | null>(null);
  const [upsell, setUpsell] = useState<string | null>(null);
  const [handoverUnsent, setHandoverUnsent] = useState(0);
  const stateRef = useRef<ControlState>("checking");
  const setBoth = (s: ControlState) => { stateRef.current = s; setState(s); };

  const call = useCallback(async (mode: "open" | "heartbeat" | "takeover"): Promise<DeviceResponse | null> => {
    try {
      const res = await fetch("/api/live-group/device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: getDeviceId(), label: getDeviceLabel(), mode }),
        cache: "no-store",
      });
      if (!res.ok) return null;
      const body: DeviceResponse = await res.json();
      setUpsell(body.upsell);
      return body;
    } catch {
      return null; // offline — keep the current state, try again next beat
    }
  }, []);

  // Control was lost: FIRST push any queued saves (they were logged while
  // this device had control, so the server still accepts them), THEN
  // lock the inputs. If the network won't cooperate within the timeout,
  // the saves stay queued and keep retrying in the background.
  const loseControl = useCallback(async (by: OtherDevice | null) => {
    if (stateRef.current === "handover" || stateRef.current === "displaced") return;
    setDisplacedBy(by);
    setBoth("handover");
    const left = await drainLiveQueue(HANDOVER_FLUSH_MS);
    setHandoverUnsent(left);
    setBoth("displaced");
  }, []);

  const apply = useCallback((r: DeviceResponse | null) => {
    if (!r) return;
    if (r.status === "active") { setBoth("active"); return; }
    if (r.status === "displaced") { loseControl(r.displacedBy ?? null); return; }
    // full
    setOthers(r.activeDevices ?? []);
    if (stateRef.current === "active") {
      // Was active, heartbeat lapsed and the slot's gone: same as losing
      // control to whichever device now holds it.
      loseControl(r.activeDevices?.[0] ?? null);
    } else if (stateRef.current === "checking") {
      setBoth("full");
    }
  }, [loseControl]);

  // First claim when /live opens.
  useEffect(() => {
    call("open").then((r) => {
      // Couldn't reach the server at all: don't block the coach — act as
      // in control locally; the queue + heartbeat sort it out when the
      // connection returns.
      if (!r) { setBoth("active"); return; }
      apply(r);
    });
  }, [call, apply]);

  // Heartbeat while visible and in control; an immediate one when the
  // tab comes back into view.
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState !== "visible" || stateRef.current !== "active") return;
      call("heartbeat").then(apply);
    };
    const id = setInterval(beat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", beat);
    window.addEventListener("online", beat);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", beat);
      window.removeEventListener("online", beat);
    };
  }, [call, apply]);

  // A save refused by the server because this device isn't in control:
  // ask the server what happened (heartbeat), which leads to loseControl.
  useEffect(() => {
    setNotActiveHandler(() => {
      if (stateRef.current === "active") call("heartbeat").then(apply);
    });
    return () => setNotActiveHandler(null);
  }, [call, apply]);

  const takeOver = useCallback(async () => {
    const r = await call("takeover");
    if (r?.status === "active") {
      setDisplacedBy(null);
      setHandoverUnsent(0);
      setBoth("active");
    }
    return r?.status === "active";
  }, [call]);

  const viewOnly = useCallback(() => setBoth("viewOnly"), []);

  return {
    state,
    readOnly: state !== "active",
    others,
    displacedBy,
    upsell,
    handoverUnsent,
    takeOver,
    viewOnly,
  };
}

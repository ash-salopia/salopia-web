"use client";

// Shared subscribe/unsubscribe toggle for both surfaces - the coach
// Settings page and the athlete share-link app. Which API endpoint it
// posts to is the only thing that differs, so one component covers
// both rather than two near-identical copies.
//
// Once subscribed, also shows per-notification-type checkboxes (0062)
// - a coach/athlete can keep push on overall but turn off one specific
// kind of alert, rather than all-or-nothing. Coach prefs live directly
// on their own `coaches` row (RLS already lets a coach update their
// own row - see 0001's "Coaches update own row" policy), so those
// save via a direct Supabase client call, no API route needed. Athlete
// prefs go through /api/athlete-link/notification-settings since
// athletes have no auth session to be scoped by RLS at all.

import { useEffect, useState } from "react";
import { isPushSupported, currentPushSubscription, subscribeToPush, unsubscribeFromPush } from "@/lib/push/subscribe-client";
import { createClient } from "@/lib/supabase-browser";

interface Props {
  mode: "coach" | "athlete";
  token?: string; // required for mode="athlete"
  label?: string;
}

interface PrefItem {
  key: string;
  label: string;
  timeKey?: string; // this pref has an associated time-of-day (native <input type="time"> - a scrollable wheel on mobile)
}

const COACH_PREFS: PrefItem[] = [{ key: "notify_pb", label: "An athlete hits a PB" }];
const ATHLETE_PREFS: PrefItem[] = [
  { key: "notify_morning_reminder", label: "I have a session today", timeKey: "morning_reminder_time" },
  { key: "notify_missed_session", label: "I haven't started today's session (evening)" },
  { key: "notify_rpe_reminder", label: "I finished a session but haven't rated it (evening)" },
];
const DEFAULT_MORNING_TIME = "07:00";

export default function PushNotificationToggle({ mode, token, label }: Props) {
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState(false);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [times, setTimes] = useState<Record<string, string>>({});
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [savingPref, setSavingPref] = useState<string | null>(null);

  const prefItems = mode === "coach" ? COACH_PREFS : ATHLETE_PREFS;

  useEffect(() => {
    if (!isPushSupported()) {
      setSupported(false);
      setChecked(true);
      return;
    }
    currentPushSubscription()
      .then(async (sub) => {
        setSubscribed(!!sub);
        if (sub) await loadPrefs();
      })
      .finally(() => setChecked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPrefs() {
    try {
      if (mode === "coach") {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from("coaches").select("notify_pb").eq("id", user.id).single();
        setPrefs({ notify_pb: (data as any)?.notify_pb ?? true });
      } else {
        const res = await fetch(`/api/athlete-link/notification-settings?token=${token}`);
        const data = await res.json();
        setPrefs({
          notify_missed_session: data.notify_missed_session ?? true,
          notify_rpe_reminder: data.notify_rpe_reminder ?? true,
          notify_morning_reminder: data.notify_morning_reminder ?? true,
        });
        setTimes({ morning_reminder_time: data.morning_reminder_time ?? DEFAULT_MORNING_TIME });
      }
    } finally {
      setPrefsLoaded(true);
    }
  }

  async function togglePref(key: string) {
    const next = !(prefs[key] ?? true);
    setPrefs((p) => ({ ...p, [key]: next }));
    setSavingPref(key);
    try {
      if (mode === "coach") {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error();
        const { error } = await supabase.from("coaches").update({ [key]: next }).eq("id", user.id);
        if (error) throw error;
      } else {
        const res = await fetch("/api/athlete-link/notification-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, [key]: next }),
        });
        if (!res.ok) throw new Error();
      }
    } catch {
      setPrefs((p) => ({ ...p, [key]: !next })); // roll back
      setError("Could not save that - try again.");
    } finally {
      setSavingPref(null);
    }
  }

  async function handleTimeChange(timeKey: string, value: string) {
    const prev = times[timeKey];
    setTimes((t) => ({ ...t, [timeKey]: value }));
    setSavingPref(timeKey);
    try {
      const res = await fetch("/api/athlete-link/notification-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, [timeKey]: value }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setTimes((t) => ({ ...t, [timeKey]: prev }));
      setError("Could not save that time - try again.");
    } finally {
      setSavingPref(null);
    }
  }

  async function handleEnable() {
    setBusy(true);
    setError("");
    const result = await subscribeToPush(async (sub) => {
      const url = mode === "coach" ? "/api/push/subscribe" : "/api/athlete-link/push-subscribe";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "athlete" ? { ...sub, token } : sub),
      });
      if (!res.ok) throw new Error("Could not save subscription");
    });
    if (result === "subscribed") {
      setSubscribed(true);
      await loadPrefs();
    } else if (result === "denied") {
      setError("Notifications are blocked - enable them in your browser/device settings to turn this on.");
    } else if (result === "unsupported") {
      setSupported(false);
    } else {
      setError("Could not enable notifications - try again.");
    }
    setBusy(false);
  }

  async function handleDisable() {
    setBusy(true);
    setError("");
    try {
      const sub = await currentPushSubscription();
      if (sub) {
        const url = mode === "coach" ? "/api/push/unsubscribe" : "/api/athlete-link/push-unsubscribe";
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mode === "athlete" ? { endpoint: sub.endpoint, token } : { endpoint: sub.endpoint }),
        });
      }
      await unsubscribeFromPush();
      setSubscribed(false);
    } catch {
      setError("Could not turn off notifications - try again.");
    }
    setBusy(false);
  }

  if (!checked || !supported) return null;

  return (
    <div style={s.wrap}>
      <div style={s.row}>
        <div>
          <div style={s.title}>🔔 {label ?? "Push notifications"}</div>
          <div style={s.desc}>
            {mode === "coach"
              ? "Get notified on this device when an athlete hits a PB."
              : "Get reminded on this device when you have a session today, and if you haven't logged or rated it yet."}
          </div>
        </div>
        <button
          style={{ ...s.toggleSwitch, background: subscribed ? "var(--accent)" : "var(--panel2)", opacity: busy ? 0.6 : 1 }}
          disabled={busy}
          onClick={() => (subscribed ? handleDisable() : handleEnable())}
        >
          <div style={{ ...s.toggleThumb, transform: subscribed ? "translateX(20px)" : "translateX(0)" }} />
        </button>
      </div>
      {error && <div style={s.error}>{error}</div>}

      {subscribed && prefsLoaded && (
        <div style={s.prefsBlock}>
          <div style={s.prefsTitle}>Notify me when…</div>
          {prefItems.map((item) => (
            <div key={item.key} style={s.prefItemWrap}>
              <label style={{ ...s.prefRow, opacity: savingPref === item.key ? 0.6 : 1 }}>
                <input
                  type="checkbox"
                  checked={prefs[item.key] ?? true}
                  disabled={savingPref === item.key}
                  onChange={() => togglePref(item.key)}
                  style={{ accentColor: "var(--accent)" }}
                />
                {item.label}
              </label>
              {item.timeKey && (prefs[item.key] ?? true) && (
                <input
                  type="time"
                  value={times[item.timeKey] ?? DEFAULT_MORNING_TIME}
                  disabled={savingPref === item.timeKey}
                  onChange={(e) => handleTimeChange(item.timeKey!, e.target.value)}
                  style={s.timeInput}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginBottom: 16 },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  title: { fontSize: 14, fontWeight: 700, color: "var(--text)" },
  desc: { fontSize: 12, color: "var(--mute)", marginTop: 2, maxWidth: 420 },
  error: { fontSize: 12, color: "#FF6B6B", marginTop: 8 },
  toggleSwitch: { width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer", position: "relative", flexShrink: 0, padding: 2 },
  toggleThumb: { width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "transform 0.15s" },
  prefsBlock: { marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 },
  prefsTitle: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.05em" },
  prefItemWrap: { display: "flex", flexDirection: "column", gap: 6 },
  prefRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)", cursor: "pointer" },
  timeInput: { marginLeft: 24, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6, padding: "5px 8px", fontSize: 13, width: "fit-content" },
};

"use client";

import { useEffect, useMemo, useState } from "react";

// "Recommended actions" (beta) - one ranked to-do list at the top of the
// coach Dashboard, built from the signals the Dashboard already loads
// (no extra queries): programmes running out, messages and session
// comments left waiting, poor check-ins, availability/load flags, tests
// and reports due, athletes not training. Urgent first, then high, then
// normal; oldest-waiting first within a tier.
//
// "Done for today" hides an item until tomorrow; the waiting-time
// thresholds are adjustable. Both are per-coach browser conveniences
// (localStorage), not shared state.

export type Severity = "urgent" | "high" | "normal";

export interface RecAction {
  id: string;
  severity: Severity;
  athleteId: string;
  athleteName: string;
  title: string;
  detail?: string;
  waitingDays?: number;
  action: { label: string; kind: "message" | "athlete"; initialText?: string };
}

export interface RecInputs {
  programmes: { athleteId: string; athleteName: string; daysLeft: number | null; lastDate: string | null }[];
  messages: { id: string; athleteId: string; athleteName: string; body: string; createdAt: string }[];
  sessionComments: { sessionId: string; athleteId: string; athleteName: string; sessionName: string; date: string; note: string }[];
  poorCheckIns: { athleteId: string; athleteName: string; flags: string[] }[];
  unavailable: { athleteId: string; athleteName: string; status: string }[];
  loadFlags: { athleteId: string; athleteName: string; reasons: string[]; severe: boolean }[];
  recovery: { athleteId: string; athleteName: string; lowCount: number }[];
  testsDue: { athleteId: string; athleteName: string; daysUntilTest: number }[];
  reportsDue: { athleteId: string; athleteName: string; daysOverdue: number }[];
  notTrained: { athleteId: string; athleteName: string }[];
  lowCompletion: { athleteId: string; athleteName: string; completionPct: number | null }[];
}

export interface RecThresholds {
  messageDays: number; // a message waiting this long becomes "high"
  commentDays: number; // same for session comments
  programmeWarnDays: number; // programme ending within this many days is flagged
}

const DEFAULT_THRESHOLDS: RecThresholds = { messageDays: 2, commentDays: 3, programmeWarnDays: 7 };
const TH_KEY = "vb:recs:thresholds";
const DONE_KEY = (d: string) => `vb:recs:done:${d}`;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso).getTime()) / 86_400_000));
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const clip = (s: string, n = 60) => (s.length > n ? s.slice(0, n).trimEnd() + "…" : s);

export function buildRecommendedActions(inp: RecInputs, th: RecThresholds): RecAction[] {
  const out: RecAction[] = [];

  for (const c of inp.poorCheckIns) {
    out.push({
      id: `checkin:${c.athleteId}:${today()}`,
      severity: "urgent",
      athleteId: c.athleteId,
      athleteName: c.athleteName,
      title: "Poor check-in today",
      detail: c.flags.join(", "),
      action: { label: "Message", kind: "message", initialText: "Saw your check-in today - how are you feeling? " },
    });
  }
  for (const f of inp.loadFlags) {
    out.push({
      id: `load:${f.athleteId}`,
      severity: f.severe ? "urgent" : "high",
      athleteId: f.athleteId,
      athleteName: f.athleteName,
      title: f.severe ? "Training load spike" : "Training load flag",
      detail: f.reasons.join(" · "),
      action: { label: "Review", kind: "athlete" },
    });
  }
  for (const u of inp.unavailable) {
    out.push({ id: `rtp:${u.athleteId}`, severity: "high", athleteId: u.athleteId, athleteName: u.athleteName, title: `Availability: ${u.status}`, detail: "Check their programme fits", action: { label: "Review", kind: "athlete" } });
  }
  for (const p of inp.programmes) {
    if (p.daysLeft == null) {
      out.push({ id: `prog:${p.athleteId}:none`, severity: "high", athleteId: p.athleteId, athleteName: p.athleteName, title: "No sessions programmed", detail: "Nothing on their calendar yet", action: { label: "Programme", kind: "athlete" } });
    } else if (p.daysLeft < 0) {
      out.push({
        id: `prog:${p.athleteId}:expired`,
        severity: "urgent",
        athleteId: p.athleteId,
        athleteName: p.athleteName,
        title: "Programme has run out",
        detail: `Last session was ${plural(-p.daysLeft, "day")} ago`,
        waitingDays: -p.daysLeft,
        action: { label: "Programme", kind: "athlete" },
      });
    } else if (p.daysLeft <= th.programmeWarnDays) {
      out.push({
        id: `prog:${p.athleteId}:ending`,
        severity: p.daysLeft <= 3 ? "high" : "normal",
        athleteId: p.athleteId,
        athleteName: p.athleteName,
        title: p.daysLeft === 0 ? "Programme ends today" : `Programme ends in ${plural(p.daysLeft, "day")}`,
        detail: "Plan the next block",
        action: { label: "Programme", kind: "athlete" },
      });
    }
  }
  // Messages: one item per athlete, aged by their oldest waiting message.
  const byAthlete = new Map<string, RecInputs["messages"]>();
  for (const m of inp.messages) byAthlete.set(m.athleteId, [...(byAthlete.get(m.athleteId) ?? []), m]);
  for (const [athleteId, msgs] of byAthlete) {
    const oldest = msgs.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
    const latest = msgs.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
    const age = daysSince(oldest.createdAt);
    out.push({
      id: `msg:${athleteId}:${latest.id}`,
      severity: age >= th.messageDays ? "high" : "normal",
      athleteId,
      athleteName: oldest.athleteName,
      title: age >= 1 ? `Message waiting ${plural(age, "day")}` : msgs.length > 1 ? `${msgs.length} new messages` : "New message",
      detail: `“${clip(latest.body || "Voice note")}”`,
      waitingDays: age,
      action: { label: "Reply", kind: "message" },
    });
  }
  for (const c of inp.sessionComments) {
    const age = daysSince(c.date);
    out.push({
      id: `note:${c.sessionId}`,
      severity: age >= th.commentDays ? "high" : "normal",
      athleteId: c.athleteId,
      athleteName: c.athleteName,
      title: age >= 1 ? `Session comment unread ${plural(age, "day")}` : "New session comment",
      detail: `${c.sessionName}: “${clip(c.note)}”`,
      waitingDays: age,
      action: { label: "Reply", kind: "message", initialText: `Re: your note on "${c.sessionName}" (${c.date}) - ` },
    });
  }
  for (const r of inp.recovery) {
    out.push({ id: `recovery:${r.athleteId}`, severity: "high", athleteId: r.athleteId, athleteName: r.athleteName, title: "Poor recovery this week", detail: `${plural(r.lowCount, "low score")} in the last 7 days`, action: { label: "Review", kind: "athlete" } });
  }
  for (const t of inp.testsDue) {
    out.push({
      id: `test:${t.athleteId}`,
      severity: t.daysUntilTest < 0 ? "high" : "normal",
      athleteId: t.athleteId,
      athleteName: t.athleteName,
      title: t.daysUntilTest < 0 ? `Testing overdue by ${plural(-t.daysUntilTest, "day")}` : t.daysUntilTest === 0 ? "Testing due today" : `Testing due in ${plural(t.daysUntilTest, "day")}`,
      waitingDays: Math.max(0, -t.daysUntilTest),
      action: { label: "Testing", kind: "athlete" },
    });
  }
  for (const r of inp.reportsDue) {
    out.push({
      id: `report:${r.athleteId}`,
      severity: r.daysOverdue > 14 ? "high" : "normal",
      athleteId: r.athleteId,
      athleteName: r.athleteName,
      title: r.daysOverdue > 0 ? `Report overdue by ${plural(r.daysOverdue, "day")}` : "Report due",
      waitingDays: r.daysOverdue,
      action: { label: "Report", kind: "athlete" },
    });
  }
  // Not training only means something once the week is under way.
  const dow = new Date().getDay(); // 0 Sun
  if (dow === 0 || dow >= 4) {
    for (const n of inp.notTrained) {
      out.push({ id: `nottrained:${n.athleteId}:${today()}`, severity: "normal", athleteId: n.athleteId, athleteName: n.athleteName, title: "No training logged this week", action: { label: "Check in", kind: "message", initialText: "Hey - how's this week going? " } });
    }
  }
  for (const l of inp.lowCompletion) {
    out.push({ id: `lowcomp:${l.athleteId}:${today()}`, severity: "normal", athleteId: l.athleteId, athleteName: l.athleteName, title: `Only ${l.completionPct ?? 0}% completed this week`, action: { label: "Review", kind: "athlete" } });
  }

  // Within an urgency level, people waiting on the coach come first
  // (check-ins, messages, comments), then programmes, then admin.
  const rank: Record<Severity, number> = { urgent: 0, high: 1, normal: 2 };
  const KIND_ORDER = ["checkin", "load", "prog", "msg", "note", "rtp", "recovery", "nottrained", "lowcomp", "test", "report"];
  const kindRank = (a: RecAction) => {
    const k = KIND_ORDER.indexOf(a.id.split(":")[0]);
    return k === -1 ? KIND_ORDER.length : k;
  };
  return out.sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] ||
      kindRank(a) - kindRank(b) ||
      (b.waitingDays ?? 0) - (a.waitingDays ?? 0) ||
      a.athleteName.localeCompare(b.athleteName)
  );
}

const SEV: Record<Severity, { label: string; colour: string }> = {
  urgent: { label: "Urgent", colour: "#E5484D" },
  high: { label: "Soon", colour: "#F59E0B" },
  normal: { label: "When you can", colour: "#4DC3FF" },
};

export default function RecommendedActions({
  inputs,
  onMessage,
  onOpenAthlete,
}: {
  inputs: RecInputs;
  onMessage: (athleteId: string, athleteName: string, initialText?: string) => void;
  onOpenAthlete: (athleteId: string, label: string) => void;
}) {
  const [thresholds, setThresholds] = useState<RecThresholds>(DEFAULT_THRESHOLDS);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    try {
      const t = JSON.parse(localStorage.getItem(TH_KEY) || "null");
      if (t) setThresholds({ ...DEFAULT_THRESHOLDS, ...t });
      setDone(new Set(JSON.parse(localStorage.getItem(DONE_KEY(today())) || "[]")));
    } catch {}
  }, []);

  const saveThresholds = (t: RecThresholds) => {
    setThresholds(t);
    try {
      localStorage.setItem(TH_KEY, JSON.stringify(t));
    } catch {}
  };
  const markDone = (id: string) => {
    const next = new Set(done).add(id);
    setDone(next);
    try {
      localStorage.setItem(DONE_KEY(today()), JSON.stringify([...next]));
    } catch {}
  };

  const all = useMemo(() => buildRecommendedActions(inputs, thresholds), [inputs, thresholds]);
  const items = all.filter((i) => !done.has(i.id));
  const shown = showAll ? items : items.slice(0, 6);
  const counts = { urgent: items.filter((i) => i.severity === "urgent").length, high: items.filter((i) => i.severity === "high").length };

  return (
    <section style={s.card}>
      <div style={s.head}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={s.title}>Recommended actions</span>
          <span style={s.beta}>Beta</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={s.summary}>
            {items.length === 0 ? "All clear" : `${counts.urgent ? `${counts.urgent} urgent · ` : ""}${counts.high ? `${counts.high} soon · ` : ""}${items.length} total`}
          </span>
          <button style={s.link} onClick={() => setSettingsOpen((o) => !o)}>{settingsOpen ? "Close" : "Adjust"}</button>
        </div>
      </div>

      {settingsOpen && (
        <div style={s.settings}>
          {([
            ["messageDays", "Flag a message as waiting after", "days"],
            ["commentDays", "Flag a session comment as waiting after", "days"],
            ["programmeWarnDays", "Warn when a programme ends within", "days"],
          ] as const).map(([key, label, unit]) => (
            <label key={key} style={s.setRow}>
              <span>{label}</span>
              <input
                type="number"
                min={0}
                max={60}
                value={thresholds[key]}
                onChange={(e) => saveThresholds({ ...thresholds, [key]: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })}
                style={s.num}
              />
              <span style={{ color: "var(--mute)" }}>{unit}</span>
            </label>
          ))}
          <div style={s.hint}>Saved on this device. &ldquo;Done&rdquo; hides an item until tomorrow.</div>
        </div>
      )}

      {items.length === 0 ? (
        <div style={s.empty}>Nothing needs you right now.</div>
      ) : (
        <div>
          {shown.map((i) => (
            <div key={i.id} style={s.row}>
              <span style={{ ...s.dot, background: SEV[i.severity].colour }} title={SEV[i.severity].label} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.rowTitle}>
                  <button style={s.name} onClick={() => onOpenAthlete(i.athleteId, "athlete")}>{i.athleteName}</button>
                  <span style={{ color: "var(--mute)" }}> · </span>
                  <span>{i.title}</span>
                </div>
                {i.detail && <div style={s.detail}>{i.detail}</div>}
              </div>
              <button
                style={s.primary}
                onClick={() => (i.action.kind === "message" ? onMessage(i.athleteId, i.athleteName, i.action.initialText) : onOpenAthlete(i.athleteId, i.action.label))}
              >
                {i.action.label}
              </button>
              <button style={s.ghost} onClick={() => markDone(i.id)} title="Hide until tomorrow">
                Done
              </button>
            </div>
          ))}
          {items.length > 6 && (
            <button style={{ ...s.link, marginTop: 8 }} onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show fewer" : `Show all ${items.length}`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: "16px 18px", marginBottom: 20 },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 },
  title: { fontSize: 16, fontWeight: 800, color: "var(--text)" },
  beta: { fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 999, padding: "1px 7px" },
  summary: { fontSize: 12, color: "var(--mute)" },
  link: { background: "transparent", border: "none", color: "var(--accent)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 },
  settings: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 },
  setRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)", flexWrap: "wrap" },
  num: { width: 60, background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 7, padding: "5px 8px", fontSize: 13 },
  hint: { fontSize: 11, color: "var(--mute)" },
  empty: { fontSize: 13, color: "var(--mute)", padding: "8px 0" },
  row: { display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: "1px solid var(--line)" },
  dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  rowTitle: { fontSize: 13.5, color: "var(--text)", fontWeight: 600, lineHeight: 1.35 },
  name: { background: "transparent", border: "none", padding: 0, color: "var(--text)", fontWeight: 800, fontSize: 13.5, cursor: "pointer" },
  detail: { fontSize: 12, color: "var(--mute)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  primary: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0 },
  ghost: { background: "transparent", color: "var(--mute)", border: "1px solid var(--line)", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 },
};

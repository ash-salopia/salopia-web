"use client";

import { useEffect, useState } from "react";
import { listSharedReports, revokeSharedReport, getReportSchedule, saveReportSchedule, type SharedReportRow, type ReportSchedule } from "@/lib/data/report-shares";
import type { ReportOptions } from "@/lib/report-options";
import { todayISO } from "@/lib/date-utils";

// Inside the Reports pop-up: the reports already sent to this athlete
// (copy / withdraw each link) and the report schedule (a reminder every
// N weeks to review and send, using the options currently ticked).

function fmt(iso: string): string {
  return new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function addWeeks(iso: string, weeks: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

export default function ReportHistoryPanel({ athleteId, athleteName, options }: { athleteId: string; athleteName: string; options: ReportOptions }) {
  const firstName = athleteName.split(" ")[0] || athleteName;
  const [open, setOpen] = useState<"history" | "schedule" | null>(null);
  const [reports, setReports] = useState<SharedReportRow[] | null>(null);
  const [schedule, setSchedule] = useState<ReportSchedule | null | undefined>(undefined);
  const [everyWeeks, setEveryWeeks] = useState(4);
  const [nextDue, setNextDue] = useState(addWeeks(todayISO(), 4));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    listSharedReports(athleteId).then(setReports).catch(() => setReports([]));
    getReportSchedule(athleteId).then((s) => {
      setSchedule(s);
      if (s) {
        setEveryWeeks(s.every_weeks);
        setNextDue(s.next_due);
      }
    });
  }, [athleteId]);

  const status = (r: SharedReportRow) =>
    r.revoked_at ? "Withdrawn" : new Date(r.expires_at).getTime() < Date.now() ? "Expired" : "Active";

  const copy = async (id: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/r/${id}`);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {}
  };

  const withdraw = async (id: string) => {
    if (!confirm("Withdraw this report? The link stops working and it's removed from the athlete's app.")) return;
    try {
      await revokeSharedReport(id);
      setReports((rs) => (rs ?? []).map((r) => (r.id === id ? { ...r, revoked_at: new Date().toISOString() } : r)));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not withdraw");
    }
  };

  const save = async (active: boolean) => {
    setSaving(true);
    setMsg("");
    try {
      const s = await saveReportSchedule({ athleteId, everyWeeks, nextDue, options, active });
      setSchedule(s);
      setMsg(active ? `Saved - you'll get a reminder on ${fmt(s.next_due)}.` : "Schedule turned off.");
    } catch (e) {
      setMsg(e instanceof Error && /report_schedules/.test(e.message) ? "Run migration 0123 to turn on schedules." : e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const activeCount = (reports ?? []).filter((r) => status(r) === "Active").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
      <button style={h.row} onClick={() => setOpen(open === "history" ? null : "history")}>
        <span>📬 Reports sent{reports && reports.length ? ` (${reports.length})` : ""}</span>
        <span style={h.rowMeta}>{activeCount ? `${activeCount} active link${activeCount === 1 ? "" : "s"}` : ""} {open === "history" ? "▲" : "▼"}</span>
      </button>
      {open === "history" && (
        <div style={h.body}>
          {reports == null ? (
            <div style={h.muted}>Loading…</div>
          ) : reports.length === 0 ? (
            <div style={h.muted}>No reports sent to {firstName} yet.</div>
          ) : (
            reports.map((r) => {
              const st = status(r);
              return (
                <div key={r.id} style={h.item}>
                  <div style={{ minWidth: 0 }}>
                    <div style={h.itemTitle}>{r.range_label || r.title}</div>
                    <div style={h.muted}>
                      {fmt(r.created_at)}
                      {r.emailed_to?.length ? ` · emailed to ${r.emailed_to.join(", ")}` : " · link only"}
                      {r.visible_to_athlete ? " · in app" : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span style={{ ...h.pill, color: st === "Active" ? "#1baf7a" : "var(--mute)" }}>{st}</span>
                    {st === "Active" && (
                      <>
                        <button style={h.mini} onClick={() => copy(r.id)}>{copiedId === r.id ? "Copied" : "Copy"}</button>
                        <button style={{ ...h.mini, color: "#FF6B6B" }} onClick={() => withdraw(r.id)}>Withdraw</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <button style={h.row} onClick={() => setOpen(open === "schedule" ? null : "schedule")}>
        <span>⏰ Report schedule</span>
        <span style={h.rowMeta}>
          {schedule?.active ? `Every ${schedule.every_weeks} wk · next ${fmt(schedule.next_due)}` : "Off"} {open === "schedule" ? "▲" : "▼"}
        </span>
      </button>
      {open === "schedule" && (
        <div style={h.body}>
          <div style={h.muted}>
            On the due date you&apos;ll get an email and notification with {firstName}&apos;s report already built using the options ticked
            below - check the Coach&apos;s Summary, then send in one click.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <label style={h.field}>
              Every
              <select value={everyWeeks} onChange={(e) => setEveryWeeks(Number(e.target.value))} style={h.input}>
                {[2, 4, 6, 8, 12].map((w) => (
                  <option key={w} value={w}>{w} weeks</option>
                ))}
              </select>
            </label>
            <label style={h.field}>
              Next due
              <input type="date" value={nextDue} min={todayISO()} onChange={(e) => setNextDue(e.target.value)} style={h.input} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button style={h.save} disabled={saving} onClick={() => save(true)}>{saving ? "Saving…" : schedule?.active ? "Update schedule" : "Turn on"}</button>
            {schedule?.active && (
              <button style={h.mini} disabled={saving} onClick={() => save(false)}>Turn off</button>
            )}
          </div>
        </div>
      )}
      {msg && <div style={{ ...h.muted, color: "var(--text)" }}>{msg}</div>}
    </div>
  );
}

const h: Record<string, React.CSSProperties> = {
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "left" },
  rowMeta: { fontSize: 11, color: "var(--mute)", fontWeight: 600, whiteSpace: "nowrap" },
  body: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 0 },
  muted: { fontSize: 11, color: "var(--mute)", lineHeight: 1.45 },
  item: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--line)" },
  itemTitle: { fontSize: 13, fontWeight: 600, color: "var(--text)" },
  pill: { fontSize: 10, fontWeight: 800, textTransform: "uppercase" },
  mini: { background: "transparent", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer" },
  field: { display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 700, color: "var(--mute)", flex: 1, minWidth: 120 },
  input: { background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "7px 9px", fontSize: 13 },
  save: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
};

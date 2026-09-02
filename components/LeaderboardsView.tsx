"use client";

import { useMemo, useState } from "react";
import type { LeaderboardBoard, AgeBand, LeaderboardEntry, LbSquad } from "@/lib/leaderboards";
import { DEFAULT_BRANDING, type ResolvedBranding } from "@/types/branding";
import { brandHeaderHtml, reportCreditFooterHtml } from "@/lib/report-branding";

const SQUAD_TOP_N = 5;
const POS_LABELS = ["1st", "2nd", "3rd", "4th", "5th"];

// First name, plus a surname initial for anyone who shares a first name with
// another athlete in the same list.
function nameLabels(entries: Pick<LeaderboardEntry, "athleteId" | "firstName" | "lastInitial">[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const k = e.firstName.toLowerCase();
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const out = new Map<string, string>();
  for (const e of entries) {
    const clash = (counts.get(e.firstName.toLowerCase()) ?? 0) > 1;
    out.set(e.athleteId, clash && e.lastInitial ? `${e.firstName} ${e.lastInitial}.` : e.firstName);
  }
  return out;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export default function LeaderboardsView({
  boards,
  bands,
  squads,
  me,
  loading,
  branding = DEFAULT_BRANDING,
}: {
  boards: LeaderboardBoard[];
  bands: AgeBand[];
  squads?: LbSquad[];
  me?: { id: string; sex: "male" | "female" | null; bandLabel: string | null } | null;
  loading?: boolean;
  branding?: ResolvedBranding;
}) {
  const squadList = squads ?? [];
  const hasSquads = squadList.length > 0;

  const [view, setView] = useState<"bands" | "squads">("bands");
  const [squadLayout, setSquadLayout] = useState<"list" | "table">("list");
  const [sex, setSex] = useState<"male" | "female">(me?.sex === "female" ? "female" : "male");
  const [squadId, setSquadId] = useState<string>(squadList[0]?.id ?? "");
  // Which cell / board is expanded to its full ranked list.
  const [open, setOpen] = useState<string | null>(null);

  const boardLabel = (b: LeaderboardBoard) =>
    b.mode === "relative" ? `${b.title} · ×BW` : b.mode === "absolute" ? `${b.title} · kg` : b.title;

  // Age-groups view: leader + full list per band, for the selected sex.
  const grid = useMemo(() => {
    return boards.map((b) => {
      const leaders: Record<string, LeaderboardEntry | undefined> = {};
      const lists: Record<string, LeaderboardEntry[]> = {};
      for (const band of bands) {
        const rows = b.entries
          .filter((e) => e.sex === sex && e.bandLabel === band.label)
          .sort((a, c) => a.rank - c.rank);
        lists[band.label] = rows;
        leaders[band.label] = rows[0];
      }
      return { board: b, leaders, lists };
    });
  }, [boards, bands, sex]);

  // Squads view: each board re-ranked across the whole squad (no age/sex split).
  // Boards where no squad member has a result are dropped.
  const squadGrid = useMemo(() => {
    const squad = squadList.find((sq) => sq.id === squadId);
    if (!squad) return [];
    const members = new Set(squad.athleteIds);
    return boards
      .map((b) => {
        const rows = b.entries
          .filter((e) => members.has(e.athleteId))
          .slice()
          .sort((a, c) => (b.lowerIsBetter ? a.value - c.value : c.value - a.value))
          .map((e, i) => ({ ...e, rank: i + 1 }));
        return { board: b, rows };
      })
      .filter((g) => g.rows.length > 0);
  }, [boards, squadList, squadId]);

  if (loading) return <div style={s.muted}>Loading…</div>;
  if (boards.length === 0) {
    return (
      <div style={s.muted}>
        No leaderboards yet — a coach needs to pick some strength exercises in Settings, and athletes need
        logged PBs or test results.
      </div>
    );
  }

  const strengthRows = grid.filter((g) => g.board.source === "strength");
  const testingRows = grid.filter((g) => g.board.source === "testing");
  const squadStrength = squadGrid.filter((g) => g.board.source === "strength");
  const squadTesting = squadGrid.filter((g) => g.board.source === "testing");
  const currentSquad = squadList.find((sq) => sq.id === squadId);

  // ── Age-groups table ──────────────────────────────────────────────────────
  const renderBandSection = (label: string, rows: typeof grid) => {
    if (rows.length === 0) return null;
    return (
      <>
        <tr>
          <td style={s.sectionRow} colSpan={bands.length + 1}>{label}</td>
        </tr>
        {rows.map(({ board, leaders, lists }) => (
          <tr key={board.id}>
            <th style={s.rowHead} scope="row">{boardLabel(board)}</th>
            {bands.map((band) => {
              const leader = leaders[band.label];
              const cellKey = `${board.id}|${band.label}`;
              const isMe = leader && me?.id === leader.athleteId;
              const label = leader ? nameLabels(lists[band.label]).get(leader.athleteId) ?? leader.firstName : "";
              return (
                <td
                  key={band.label}
                  style={{ ...s.cell, ...(leader ? s.cellFilled : {}), ...(isMe ? s.cellMe : {}) }}
                  onClick={() => leader && setOpen(open === cellKey ? null : cellKey)}
                >
                  {leader ? (
                    <>
                      <div style={s.cellName}>{label}{isMe ? " (you)" : ""}</div>
                      <div style={s.cellVal}>{leader.displayValue}</div>
                    </>
                  ) : (
                    <span style={s.dash}>—</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </>
    );
  };

  const openList = (() => {
    if (!open || open.startsWith("squad|")) return null;
    const [boardId, bandLabel] = open.split("|");
    const g = grid.find((x) => x.board.id === boardId);
    if (!g) return null;
    return { board: g.board, bandLabel, rows: g.lists[bandLabel] ?? [] };
  })();

  const renderRankRow = (e: LeaderboardEntry, label: string) => {
    const isMe = me?.id === e.athleteId;
    return (
      <div key={e.athleteId} style={{ ...s.row, ...(isMe ? s.rowMe : {}) }}>
        <span style={{ ...s.rank, ...(e.rank <= 3 ? s.rankTop : {}) }}>{e.rank}</span>
        <span style={s.name}>{label}{isMe ? " (you)" : ""}</span>
        {e.age != null && <span style={s.age}>{e.age}y</span>}
        <span style={s.value}>{e.displayValue}</span>
      </div>
    );
  };

  const renderRankList = (rows: LeaderboardEntry[]) => {
    const labels = nameLabels(rows);
    return <div style={s.list}>{rows.map((e) => renderRankRow(e, labels.get(e.athleteId) ?? e.firstName))}</div>;
  };

  // ── Squad list ────────────────────────────────────────────────────────────
  const squadBoardBlock = (board: LeaderboardBoard, rows: LeaderboardEntry[]) => {
    const key = `squad|${board.id}`;
    const expanded = open === key;
    const labels = nameLabels(rows);
    const shown = expanded ? rows : rows.slice(0, SQUAD_TOP_N);
    return (
      <div key={board.id} style={s.squadBoard}>
        <div style={s.squadBoardHead}>{boardLabel(board)}</div>
        <div style={s.list}>{shown.map((e) => renderRankRow(e, labels.get(e.athleteId) ?? e.firstName))}</div>
        {rows.length > SQUAD_TOP_N && (
          <button style={s.moreBtn} onClick={() => setOpen(expanded ? null : key)}>
            {expanded ? "Show top 5" : `Show all ${rows.length}`}
          </button>
        )}
      </div>
    );
  };

  // ── Squad table ───────────────────────────────────────────────────────────
  const renderSquadSection = (label: string, rows: typeof squadGrid) => {
    if (rows.length === 0) return null;
    return (
      <>
        <tr>
          <td style={s.sectionRow} colSpan={POS_LABELS.length + 1}>{label}</td>
        </tr>
        {rows.map(({ board, rows: entries }) => {
          const labels = nameLabels(entries.slice(0, SQUAD_TOP_N));
          const cellKey = `squad|${board.id}`;
          return (
            <tr key={board.id}>
              <th style={s.rowHead} scope="row">{boardLabel(board)}</th>
              {POS_LABELS.map((_, i) => {
                const e = entries[i];
                const isMe = e && me?.id === e.athleteId;
                return (
                  <td
                    key={i}
                    style={{ ...s.cell, ...(e ? s.cellFilled : {}), ...(isMe ? s.cellMe : {}) }}
                    onClick={() => entries.length > SQUAD_TOP_N && setOpen(open === cellKey ? null : cellKey)}
                  >
                    {e ? (
                      <>
                        <div style={s.cellName}>{labels.get(e.athleteId) ?? e.firstName}{isMe ? " (you)" : ""}</div>
                        <div style={s.cellVal}>{e.displayValue}</div>
                      </>
                    ) : (
                      <span style={s.dash}>—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </>
    );
  };

  const squadOpenList = (() => {
    if (!open || !open.startsWith("squad|")) return null;
    const boardId = open.slice("squad|".length);
    const g = squadGrid.find((x) => x.board.id === boardId);
    if (!g) return null;
    return { board: g.board, rows: g.rows };
  })();

  // ── Print ─────────────────────────────────────────────────────────────────
  const printLeaderboards = () => {
    const date = new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
    const sectionsHtml: string[] = [];

    const table = (headers: string[], bodyRows: string[]) =>
      `<table><thead><tr><th></th>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${bodyRows.join("")}</tbody></table>`;

    let heading: string;
    if (view === "bands") {
      heading = `Leaderboards — ${sex === "male" ? "Boys" : "Girls"}`;
      const headers = bands.map((b) => b.label);
      for (const [secLabel, secRows] of [["Strength", strengthRows], ["Testing", testingRows]] as const) {
        if (secRows.length === 0) continue;
        const body = secRows.map(({ board, leaders, lists }) => {
          const cells = bands.map((band) => {
            const leader = leaders[band.label];
            if (!leader) return `<td class="empty">—</td>`;
            const label = nameLabels(lists[band.label]).get(leader.athleteId) ?? leader.firstName;
            return `<td><b>${escapeHtml(label)}</b><br><span>${escapeHtml(leader.displayValue)}</span></td>`;
          });
          return `<tr><th>${escapeHtml(boardLabel(board))}</th>${cells.join("")}</tr>`;
        });
        sectionsHtml.push(`<h2>${secLabel}</h2>${table(headers, body)}`);
      }
    } else {
      heading = `Leaderboards — ${currentSquad?.name ?? "Squad"}`;
      const headers = POS_LABELS;
      for (const [secLabel, secRows] of [["Strength", squadStrength], ["Testing", squadTesting]] as const) {
        if (secRows.length === 0) continue;
        const body = secRows.map(({ board, rows: entries }) => {
          const labels = nameLabels(entries.slice(0, SQUAD_TOP_N));
          const cells = POS_LABELS.map((_, i) => {
            const e = entries[i];
            if (!e) return `<td class="empty">—</td>`;
            return `<td><b>${escapeHtml(labels.get(e.athleteId) ?? e.firstName)}</b><br><span>${escapeHtml(e.displayValue)}</span></td>`;
          });
          return `<tr><th>${escapeHtml(boardLabel(board))}</th>${cells.join("")}</tr>`;
        });
        sectionsHtml.push(`<h2>${secLabel}</h2>${table(headers, body)}`);
      }
    }

    // Branding matches the training-load / testing reports (ReportModal,
    // TestReportBody): the org's premium logo/name/colour (or the
    // standard-tier accent on "VIS BUILD") at the top via brandHeaderHtml,
    // the "Produced using visbuild.co.uk" credit at the foot, light
    // palette from the same CSS custom properties, 16mm page margins.
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(heading)}</title><style>
      :root{
        --text:#16202a;--mute:#6b7684;--accent:#1f6fd6;--line:#d8dde3;
        --panel:#f7f8fa;--panel2:#eef0f3;
      }
      *{box-sizing:border-box}
      body{margin:0;padding:24px;background:#fff;color:var(--text);
        font-family:-apple-system,BlinkMacSystemFont,"Inter",sans-serif}
      .subtitle{font-size:13px;font-weight:600;margin-top:4px}
      .date{color:var(--mute);font-size:11px;margin:2px 0 22px}
      h2{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);margin:20px 0 6px}
      table{border-collapse:collapse;width:100%;margin-bottom:8px;font-size:11px}
      tr{page-break-inside:avoid}
      th,td{border:1px solid var(--line);padding:5px 7px;text-align:center;vertical-align:middle}
      thead th{background:var(--panel);font-size:10px;font-weight:700;color:var(--mute)}
      tbody th{text-align:left;font-weight:700;color:var(--text);white-space:nowrap;background:var(--panel)}
      td b{font-weight:700;color:var(--text)}
      td span{color:var(--mute);font-size:10px}
      td.empty{color:var(--line)}
      @page{margin:16mm}
    </style></head><body>
      ${brandHeaderHtml(branding)}
      <div class="subtitle">${escapeHtml(heading)}</div>
      <div class="date">Generated ${escapeHtml(date)}</div>
      ${sectionsHtml.join("") || "<p>Nothing to print.</p>"}
      ${reportCreditFooterHtml()}
      <script>window.onload=function(){window.print()}</script>
    </body></html>`;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={s.wrap}>
      <div style={s.toolbar}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {hasSquads && (
            <div style={s.seg}>
              {(["bands", "squads"] as const).map((v) => (
                <button key={v} style={{ ...s.segBtn, ...(view === v ? s.segBtnOn : {}) }} onClick={() => { setView(v); setOpen(null); }}>
                  {v === "bands" ? "Age groups" : "Squads"}
                </button>
              ))}
            </div>
          )}
          {view === "bands" && (
            <div style={s.seg}>
              {(["male", "female"] as const).map((v) => (
                <button key={v} style={{ ...s.segBtn, ...(sex === v ? s.segBtnOn : {}) }} onClick={() => { setSex(v); setOpen(null); }}>
                  {v === "male" ? "Boys" : "Girls"}
                </button>
              ))}
            </div>
          )}
          {view === "squads" && hasSquads && (
            <>
              <select value={squadId} onChange={(e) => { setSquadId(e.target.value); setOpen(null); }} style={s.select}>
                {squadList.map((sq) => <option key={sq.id} value={sq.id}>{sq.name}</option>)}
              </select>
              <div style={s.seg}>
                {(["list", "table"] as const).map((v) => (
                  <button key={v} style={{ ...s.segBtn, ...(squadLayout === v ? s.segBtnOn : {}) }} onClick={() => { setSquadLayout(v); setOpen(null); }}>
                    {v === "list" ? "List" : "Table"}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button style={s.printBtn} onClick={printLeaderboards}>🖨 Print / PDF</button>
      </div>

      {view === "bands" ? (
        <>
          <div style={s.hint}>Each box shows the leader for that test and age group. Tap a box for the full ranking.</div>
          <div style={s.scroll}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.corner} />
                  {bands.map((b) => <th key={b.label} style={s.colHead}>{b.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {renderBandSection("STRENGTH", strengthRows)}
                {renderBandSection("TESTING", testingRows)}
              </tbody>
            </table>
          </div>
          {openList && (
            <div style={s.panel}>
              <div style={s.panelHead}>
                {boardLabel(openList.board)} · age {openList.bandLabel} · {sex === "male" ? "boys" : "girls"}
                <button style={s.panelClose} onClick={() => setOpen(null)}>✕</button>
              </div>
              {openList.rows.length === 0 ? <div style={s.muted}>No entries.</div> : renderRankList(openList.rows)}
            </div>
          )}
        </>
      ) : (
        <>
          {squadGrid.length === 0 ? (
            <div style={s.muted}>No one in this squad has a logged PB or test result for the leaderboard exercises yet.</div>
          ) : squadLayout === "list" ? (
            <>
              <div style={s.hint}>Top {SQUAD_TOP_N} in this squad for each exercise or test. Exercises no one in the squad has done are hidden.</div>
              {squadStrength.length > 0 && (<><div style={s.groupHead}>STRENGTH</div>{squadStrength.map((g) => squadBoardBlock(g.board, g.rows))}</>)}
              {squadTesting.length > 0 && (<><div style={s.groupHead}>TESTING</div>{squadTesting.map((g) => squadBoardBlock(g.board, g.rows))}</>)}
            </>
          ) : (
            <>
              <div style={s.hint}>Top {SQUAD_TOP_N} across the squad, best on the left. Tap a row with more than {SQUAD_TOP_N} for the full ranking.</div>
              <div style={s.scroll}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.corner} />
                      {POS_LABELS.map((p) => <th key={p} style={s.colHead}>{p}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {renderSquadSection("STRENGTH", squadStrength)}
                    {renderSquadSection("TESTING", squadTesting)}
                  </tbody>
                </table>
              </div>
              {squadOpenList && (
                <div style={s.panel}>
                  <div style={s.panelHead}>
                    {boardLabel(squadOpenList.board)} · {currentSquad?.name ?? "squad"}
                    <button style={s.panelClose} onClick={() => setOpen(null)}>✕</button>
                  </div>
                  {renderRankList(squadOpenList.rows)}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 },
  toolbar: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" },
  muted: { color: "var(--mute)", fontSize: 13, padding: "16px 0", lineHeight: 1.5 },
  hint: { fontSize: 11.5, color: "var(--mute)" },
  seg: { display: "inline-flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", alignSelf: "flex-start" },
  segBtn: { background: "transparent", border: "none", color: "var(--mute)", padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  segBtnOn: { background: "var(--accent)", color: "#0a1420" },
  select: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--text)", padding: "8px 12px", fontSize: 13, fontWeight: 600 },
  printBtn: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--text)", padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" },

  scroll: { overflowX: "auto", border: "1px solid var(--line)", borderRadius: 10 },
  table: { borderCollapse: "collapse", width: "100%", fontSize: 12 },
  corner: { position: "sticky", left: 0, background: "var(--panel)", zIndex: 2, minWidth: 120 },
  colHead: { padding: "8px 6px", fontSize: 11, fontWeight: 700, color: "var(--mute)", textAlign: "center", background: "var(--panel)", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" },
  sectionRow: { padding: "6px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "var(--mute)", background: "var(--panel2)", position: "sticky", left: 0 },
  rowHead: { position: "sticky", left: 0, background: "var(--panel)", zIndex: 1, padding: "8px 10px", fontSize: 12, fontWeight: 700, color: "var(--text)", textAlign: "left", borderTop: "1px solid var(--line)", whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" },
  cell: { padding: "6px 8px", textAlign: "center", borderTop: "1px solid var(--line)", borderLeft: "1px solid var(--line)", minWidth: 74, verticalAlign: "middle" },
  cellFilled: { cursor: "pointer" },
  cellMe: { background: "var(--accent-dim)" },
  cellName: { fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" },
  cellVal: { fontSize: 11, color: "var(--mute)", marginTop: 1, whiteSpace: "nowrap" },
  dash: { color: "var(--line)" },

  panel: { border: "1px solid var(--line)", borderRadius: 10, padding: 12, background: "var(--panel2)" },
  panelHead: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 8 },
  panelClose: { marginLeft: "auto", background: "transparent", border: "none", color: "var(--mute)", fontSize: 13, cursor: "pointer" },
  list: { display: "flex", flexDirection: "column", gap: 4 },
  row: { display: "flex", alignItems: "center", gap: 10, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px" },
  rowMe: { borderColor: "var(--accent)", background: "var(--accent-dim)" },
  rank: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15, fontWeight: 700, color: "var(--mute)", width: 20, textAlign: "center" },
  rankTop: { color: "var(--accent)" },
  name: { flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  age: { fontSize: 11, color: "var(--mute)" },
  value: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15, fontWeight: 700, color: "var(--text)" },

  groupHead: { fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "var(--mute)", marginTop: 6 },
  squadBoard: { border: "1px solid var(--line)", borderRadius: 10, padding: 12, background: "var(--panel2)", display: "flex", flexDirection: "column", gap: 8 },
  squadBoardHead: { fontSize: 12.5, fontWeight: 700, color: "var(--text)" },
  moreBtn: { alignSelf: "flex-start", background: "transparent", border: "none", color: "var(--accent)", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 },
};

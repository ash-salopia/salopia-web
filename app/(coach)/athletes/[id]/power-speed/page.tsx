"use client";

// ============================================================
// Power/Speed Benchmark Dashboard
// Route: /athletes/[id]/power-speed
//
// Shows per-athlete benchmark tracking for:
//   10m sprint, 20m sprint, Flying 10m, CMJ, Drop Jump RSI,
//   Broad Jump, 505
//
// Data sourced from power/speed session logs — no separate
// test table needed. Queries session_exercises for matching
// exercise names and extracts best/latest from log.result.
// ============================================================

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

// ── Types ─────────────────────────────────────────────────────

interface BenchmarkDef {
  key: string;
  label: string;
  unit: string;
  lowerIsBetter: boolean;
  exerciseNames: string[];  // exercise names to match (case-insensitive)
  icon: string;
  greenThreshold: number | null;
  amberThreshold: number | null;
}

interface BenchmarkResult {
  def: BenchmarkDef;
  best: number | null;
  latest: number | null;
  latestDate: string | null;
  bestDate: string | null;
  changePct: number | null;
  history: { date: string; value: number }[];
}

// ── Benchmark definitions ─────────────────────────────────────

const BENCHMARKS: BenchmarkDef[] = [
  {
    key: "10m", label: "10m Sprint", unit: "s", lowerIsBetter: true, icon: "⚡",
    exerciseNames: ["acceleration sprint", "10m sprint", "10m"],
    greenThreshold: 1.80, amberThreshold: 1.95,
  },
  {
    key: "20m", label: "20m Sprint", unit: "s", lowerIsBetter: true, icon: "🏃",
    exerciseNames: ["20m sprint", "flying sprint", "20m"],
    greenThreshold: 2.80, amberThreshold: 3.00,
  },
  {
    key: "flying10", label: "Flying 10m", unit: "s", lowerIsBetter: true, icon: "💨",
    exerciseNames: ["flying 10m", "flying 10", "flying sprint"],
    greenThreshold: 1.05, amberThreshold: 1.15,
  },
  {
    key: "cmj", label: "CMJ Height", unit: "cm", lowerIsBetter: false, icon: "🦘",
    exerciseNames: ["countermovement jump", "cmj", "countermovement jump (cmj)"],
    greenThreshold: 45, amberThreshold: 35,
  },
  {
    key: "dj_rsi", label: "Drop Jump RSI", unit: "", lowerIsBetter: false, icon: "📉",
    exerciseNames: ["drop jump", "depth jump"],
    greenThreshold: 1.8, amberThreshold: 1.2,
  },
  {
    key: "broad", label: "Broad Jump", unit: "m", lowerIsBetter: false, icon: "📏",
    exerciseNames: ["broad jump", "standing broad jump", "standing long jump"],
    greenThreshold: 2.5, amberThreshold: 2.2,
  },
  {
    key: "505", label: "505 Test", unit: "s", lowerIsBetter: true, icon: "🔄",
    exerciseNames: ["505", "505 test", "pro agility"],
    greenThreshold: 2.3, amberThreshold: 2.6,
  },
];

// ── RAG status ─────────────────────────────────────────────────

function getRag(result: BenchmarkResult): "green" | "amber" | "red" | "none" {
  const { def, best } = result;
  if (best === null || def.greenThreshold === null) return "none";
  if (def.lowerIsBetter) {
    if (best <= def.greenThreshold) return "green";
    if (def.amberThreshold && best <= def.amberThreshold) return "amber";
    return "red";
  } else {
    if (best >= def.greenThreshold) return "green";
    if (def.amberThreshold && best >= def.amberThreshold) return "amber";
    return "red";
  }
}

const RAG_COLOR = { green: "#10B981", amber: "#F59E0B", red: "#EF4444", none: "var(--mute)" };
const RAG_BG = { green: "#10B98115", amber: "#F59E0B15", red: "#EF444415", none: "var(--ink)" };

// ── Page ──────────────────────────────────────────────────────

export default function PowerSpeedDashboard() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const athleteId = params?.id;

  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [athleteName, setAthleteName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!athleteId) return;
    load();
  }, [athleteId]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();

      // Get athlete name
      const { data: athlete } = await supabase
        .from("athletes").select("name").eq("id", athleteId).single();
      setAthleteName(athlete?.name ?? "");

      // Get all power/speed session exercises for this athlete
      const { data: exercises, error: exErr } = await supabase
        .from("session_exercises")
        .select("name, log, sessions!inner(athlete_id, date, type)")
        .eq("sessions.athlete_id", athleteId)
        .eq("sessions.type", "power_speed")
        .not("sessions", "is", null)
        .order("sessions.date", { ascending: true });

      if (exErr) throw exErr;

      // Process each benchmark
      const processed: BenchmarkResult[] = BENCHMARKS.map(def => {
        const matches = (exercises ?? []).filter((ex: any) => {
          const exName = ex.name?.toLowerCase().trim() ?? "";
          return def.exerciseNames.some(n => exName.includes(n.toLowerCase()));
        });

        const history: { date: string; value: number }[] = [];

        for (const ex of matches) {
          const date = (ex.sessions as any)?.date ?? "";
          const log: any[] = ex.log ?? [];
          for (const set of log) {
            if (!set.done) continue;
            // For RSI benchmarks, use rsi field; otherwise use result
            const raw = def.key === "dj_rsi" ? set.rsi : set.result;
            const val = parseFloat(raw);
            if (!isNaN(val) && val > 0) {
              history.push({ date, value: val });
            }
          }
        }

        // Sort by date
        history.sort((a, b) => a.date.localeCompare(b.date));

        if (!history.length) {
          return { def, best: null, latest: null, latestDate: null, bestDate: null, changePct: null, history: [] };
        }

        const latest = history[history.length - 1].value;
        const latestDate = history[history.length - 1].date;

        let best = history[0].value;
        let bestDate = history[0].date;
        for (const h of history) {
          const isBetter = def.lowerIsBetter ? h.value < best : h.value > best;
          if (isBetter) { best = h.value; bestDate = h.date; }
        }

        // Change: latest vs best (if latest < best for lower-is-better, negative = improvement)
        const changePct = best !== 0
          ? Math.round(((latest - best) / best) * 100 * 10) / 10
          : null;

        return { def, best, latest, latestDate, bestDate, changePct, history };
      });

      setResults(processed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load data");
    } finally {
      setLoading(false);
    }
  };

  const hasData = results.some(r => r.best !== null);

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <button style={s.back} onClick={() => router.push(`/athletes/${athleteId}`)}>
          ← Back
        </button>
        <div>
          <div style={s.title}>⚡ Power / Speed</div>
          {athleteName && <div style={s.subtitle}>{athleteName}</div>}
        </div>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {loading ? (
        <div style={s.loading}>Loading benchmarks…</div>
      ) : !hasData ? (
        <div style={s.empty}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No data yet</div>
          <div style={{ fontSize: 13, color: "var(--mute)", maxWidth: 300 }}>
            Log results in Power/Speed sessions and they'll appear here automatically.
            Exercise names need to match the benchmarks below.
          </div>
        </div>
      ) : null}

      {!loading && (
        <>
          {/* Benchmark cards */}
          <div style={s.grid}>
            {results.map(result => {
              const rag = getRag(result);
              const { def, best, latest, latestDate, changePct, history } = result;
              const noData = best === null;

              return (
                <div key={def.key} style={{ ...s.card, background: noData ? "var(--panel)" : RAG_BG[rag], border: `1px solid ${noData ? "var(--line)" : RAG_COLOR[rag] + "44"}` }}>
                  {/* Top row */}
                  <div style={s.cardTop}>
                    <span style={s.cardIcon}>{def.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={s.cardLabel}>{def.label}</div>
                      <div style={s.cardUnit}>{def.unit || "index"}</div>
                    </div>
                    {!noData && (
                      <div style={{ ...s.ragDot, background: RAG_COLOR[rag] }} title={rag} />
                    )}
                  </div>

                  {noData ? (
                    <div style={s.noData}>No data</div>
                  ) : (
                    <>
                      {/* Stats row */}
                      <div style={s.statsRow}>
                        <div style={s.stat}>
                          <div style={s.statLabel}>Best</div>
                          <div style={{ ...s.statValue, color: RAG_COLOR[rag] }}>
                            {best!.toFixed(def.lowerIsBetter && best! < 10 ? 2 : 1)}{def.unit}
                          </div>
                          <div style={s.statDate}>{result.bestDate}</div>
                        </div>
                        <div style={s.stat}>
                          <div style={s.statLabel}>Latest</div>
                          <div style={s.statValue}>
                            {latest!.toFixed(def.lowerIsBetter && latest! < 10 ? 2 : 1)}{def.unit}
                          </div>
                          <div style={s.statDate}>{latestDate}</div>
                        </div>
                        <div style={s.stat}>
                          <div style={s.statLabel}>vs Best</div>
                          <div style={{
                            ...s.statValue,
                            color: changePct === null ? "var(--mute)"
                              : (def.lowerIsBetter ? changePct <= 0 : changePct >= 0) ? "#10B981" : "#EF4444"
                          }}>
                            {changePct === null ? "—" : `${changePct >= 0 ? "+" : ""}${changePct}%`}
                          </div>
                        </div>
                      </div>

                      {/* Mini sparkline */}
                      {history.length > 1 && (
                        <MiniSparkline
                          data={history.map(h => h.value)}
                          lowerIsBetter={def.lowerIsBetter}
                          color={RAG_COLOR[rag]}
                        />
                      )}

                      {/* Exercise name hint */}
                      <div style={s.matchHint}>
                        Matches: {def.exerciseNames.slice(0, 2).join(", ")}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Trend table */}
          {hasData && (
            <div style={s.table}>
              <div style={s.tableTitle}>Athlete trend summary</div>
              <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--line)" }}>
                    {["Test", "Best", "Latest", "Change", "Status"].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.filter(r => r.best !== null).map(r => {
                    const rag = getRag(r);
                    return (
                      <tr key={r.def.key} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={s.td}>{r.def.icon} {r.def.label}</td>
                        <td style={{ ...s.td, fontWeight: 700, color: RAG_COLOR[rag] }}>
                          {r.best!.toFixed(r.def.lowerIsBetter && r.best! < 10 ? 2 : 1)}{r.def.unit}
                        </td>
                        <td style={s.td}>
                          {r.latest!.toFixed(r.def.lowerIsBetter && r.latest! < 10 ? 2 : 1)}{r.def.unit}
                        </td>
                        <td style={{
                          ...s.td,
                          color: r.changePct === null ? "var(--mute)"
                            : (r.def.lowerIsBetter ? r.changePct! <= 0 : r.changePct! >= 0) ? "#10B981" : "#EF4444",
                          fontWeight: 700,
                        }}>
                          {r.changePct === null ? "—" : `${r.changePct! >= 0 ? "+" : ""}${r.changePct}%`}
                        </td>
                        <td style={s.td}>
                          <span style={{ ...s.ragBadge, background: RAG_COLOR[rag] + "22", color: RAG_COLOR[rag] }}>
                            {rag === "none" ? "—" : rag.charAt(0).toUpperCase() + rag.slice(1)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Mini sparkline ─────────────────────────────────────────────

function MiniSparkline({ data, lowerIsBetter, color }: { data: number[]; lowerIsBetter: boolean; color: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const W = 120, H = 28, PAD = 3;
  const pts = data.map((v, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
    // Invert Y if lower is better so improvement always goes up
    const norm = lowerIsBetter ? 1 - (v - min) / range : (v - min) / range;
    const y = PAD + (1 - norm) * (H - PAD * 2);
    return `${x},${y}`;
  });
  return (
    <svg width={W} height={H} style={{ display: "block", marginTop: 6 }}>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
      {/* Last point dot */}
      {pts.length > 0 && (() => {
        const [lx, ly] = pts[pts.length - 1].split(",").map(Number);
        return <circle cx={lx} cy={ly} r={2.5} fill={color} />;
      })()}
    </svg>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { padding: "20px 16px", maxWidth: 900, margin: "0 auto" },
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 },
  back: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "7px 12px", fontSize: 13, cursor: "pointer", flexShrink: 0 },
  title: { fontSize: 24, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", color: "var(--text)" },
  subtitle: { fontSize: 13, color: "var(--mute)", marginTop: 2 },
  error: { background: "#2a0c0c", color: "#FF6B6B", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 },
  loading: { fontSize: 14, color: "var(--mute)", padding: "24px 0" },
  empty: { textAlign: "center" as const, padding: "40px 0", color: "var(--text)" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginBottom: 24 },
  card: { borderRadius: 12, padding: 14, display: "flex", flexDirection: "column" as const, gap: 8 },
  cardTop: { display: "flex", alignItems: "center", gap: 8 },
  cardIcon: { fontSize: 20, flexShrink: 0 },
  cardLabel: { fontSize: 14, fontWeight: 700, color: "var(--text)" },
  cardUnit: { fontSize: 11, color: "var(--mute)" },
  ragDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  noData: { fontSize: 13, color: "var(--mute)", fontStyle: "italic" as const },
  statsRow: { display: "flex", gap: 6 },
  stat: { flex: 1, background: "rgba(0,0,0,0.15)", borderRadius: 6, padding: "6px 8px" },
  statLabel: { fontSize: 9, color: "var(--mute)", fontWeight: 700, textTransform: "uppercase" as const, marginBottom: 2 },
  statValue: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  statDate: { fontSize: 9, color: "var(--mute)", marginTop: 1 },
  matchHint: { fontSize: 10, color: "var(--mute)", fontStyle: "italic" as const },
  table: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16 },
  tableTitle: { fontSize: 13, fontWeight: 700, color: "var(--mute)", marginBottom: 12, textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  th: { textAlign: "left" as const, fontSize: 11, fontWeight: 700, color: "var(--mute)", padding: "6px 10px", textTransform: "uppercase" as const },
  td: { fontSize: 13, color: "var(--text)", padding: "10px 10px" },
  ragBadge: { fontSize: 11, fontWeight: 700, borderRadius: 4, padding: "2px 7px" },
};

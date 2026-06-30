"use client";

import { useState, useEffect } from "react";
import {
  listTestBatteries, createTestBattery, updateTestBattery, deleteTestBattery, setBatteryMetrics,
  listTestMetrics, createTestMetric, updateTestMetric, deleteTestMetric,
  listBenchmarksForMetric, upsertBenchmark, deleteBenchmark,
} from "@/lib/data/testing";
import type { TestBattery, TestMetric, TestBenchmark } from "@/types";

export default function TestingManagePage() {
  const [batteries, setBatteries] = useState<TestBattery[]>([]);
  const [metrics, setMetrics] = useState<TestMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"batteries" | "metrics">("batteries");

  const [selectedBatteryId, setSelectedBatteryId] = useState<string | null>(null);
  const [selectedMetricId, setSelectedMetricId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [b, m] = await Promise.all([listTestBatteries(), listTestMetrics()]);
      setBatteries(b);
      setMetrics(m);
      if (b.length && !selectedBatteryId) setSelectedBatteryId(b[0].id);
      if (m.length && !selectedMetricId) setSelectedMetricId(m[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load testing data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div style={s.page}>
      <div style={s.headRow}>
        <div>
          <h1 style={s.title}>🧪 Testing</h1>
          <p style={s.subtitle}>Manage test batteries, metrics, and benchmark norms. Log results and generate reports from each athlete's page.</p>
        </div>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      <div style={s.tabs}>
        <button style={{ ...s.tab, ...(tab === "batteries" ? s.tabActive : {}) }} onClick={() => setTab("batteries")}>
          Batteries
        </button>
        <button style={{ ...s.tab, ...(tab === "metrics" ? s.tabActive : {}) }} onClick={() => setTab("metrics")}>
          Metrics & Benchmarks
        </button>
      </div>

      {loading ? (
        <div style={s.empty}>Loading…</div>
      ) : tab === "batteries" ? (
        <BatteriesTab
          batteries={batteries}
          metrics={metrics}
          selectedId={selectedBatteryId}
          onSelect={setSelectedBatteryId}
          onReload={load}
        />
      ) : (
        <MetricsTab
          metrics={metrics}
          selectedId={selectedMetricId}
          onSelect={setSelectedMetricId}
          onReload={load}
        />
      )}
    </div>
  );
}

// ── Batteries tab ─────────────────────────────────────────────────────────────

function BatteriesTab({ batteries, metrics, selectedId, onSelect, onReload }: {
  batteries: TestBattery[]; metrics: TestMetric[]; selectedId: string | null;
  onSelect: (id: string) => void; onReload: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const battery = batteries.find((b) => b.id === selectedId);
  const [selectedMetricIds, setSelectedMetricIds] = useState<string[]>(battery?.metrics?.map((m) => m.id) ?? []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelectedMetricIds(battery?.metrics?.map((m) => m.id) ?? []);
  }, [battery?.id]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const b = await createTestBattery(newName.trim());
      setNewName(""); setCreating(false);
      await onReload();
      onSelect(b.id);
    } finally { setSaving(false); }
  };

  const handleSaveMetrics = async () => {
    if (!battery) return;
    setSaving(true);
    try {
      await setBatteryMetrics(battery.id, selectedMetricIds);
      await onReload();
    } finally { setSaving(false); }
  };

  const toggleMetric = (id: string) => {
    setSelectedMetricIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  return (
    <div style={s.splitRow}>
      <div style={s.sidebar}>
        {batteries.map((b) => (
          <button key={b.id} style={{ ...s.sidebarItem, ...(b.id === selectedId ? s.sidebarItemActive : {}) }} onClick={() => onSelect(b.id)}>
            <div style={s.sidebarItemName}>{b.name}</div>
            <div style={s.sidebarItemMeta}>{b.metrics?.length ?? 0} metrics</div>
          </button>
        ))}
        {!creating ? (
          <button style={s.addBtn} onClick={() => setCreating(true)}>+ New battery</button>
        ) : (
          <div style={s.inlineCreate}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Battery name" style={s.input} autoFocus />
            <div style={{ display: "flex", gap: 6 }}>
              <button style={s.smallGhost} onClick={() => { setCreating(false); setNewName(""); }}>Cancel</button>
              <button style={s.smallPrimary} disabled={!newName.trim() || saving} onClick={handleCreate}>Create</button>
            </div>
          </div>
        )}
      </div>

      <div style={s.detail}>
        {!battery ? (
          <div style={s.empty}>Select or create a battery.</div>
        ) : (
          <>
            <div style={s.detailHead}>
              <input
                value={battery.name}
                onChange={async (e) => { await updateTestBattery(battery.id, { name: e.target.value }); onReload(); }}
                style={s.detailNameInput}
              />
              <button style={s.dangerBtn} onClick={async () => {
                if (!confirm(`Delete "${battery.name}"? Test sessions logged against it are kept, just unlinked.`)) return;
                await deleteTestBattery(battery.id);
                onReload();
              }}>Delete</button>
            </div>
            <textarea
              value={battery.description}
              onChange={async (e) => { await updateTestBattery(battery.id, { description: e.target.value }); }}
              onBlur={onReload}
              placeholder="Description (optional)"
              rows={2}
              style={s.textarea}
            />
            <div style={s.fieldLabel}>Metrics in this battery</div>
            <div style={s.metricCheckList}>
              {metrics.length === 0 && <div style={s.emptyHint}>No metrics yet — create some in the Metrics tab first.</div>}
              {metrics.map((m) => (
                <label key={m.id} style={s.metricCheckRow}>
                  <input type="checkbox" checked={selectedMetricIds.includes(m.id)} onChange={() => toggleMetric(m.id)} />
                  <span>{m.name}</span>
                  <span style={s.metricUnitTag}>{m.unit}</span>
                </label>
              ))}
            </div>
            <button style={s.primaryBtn} disabled={saving} onClick={handleSaveMetrics}>
              {saving ? "Saving…" : "Save battery metrics"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Metrics tab ───────────────────────────────────────────────────────────────

function MetricsTab({ metrics, selectedId, onSelect, onReload }: {
  metrics: TestMetric[]; selectedId: string | null; onSelect: (id: string) => void; onReload: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newMetric, setNewMetric] = useState({ name: "", unit: "", better_direction: "higher" as "higher" | "lower" });
  const [saving, setSaving] = useState(false);
  const metric = metrics.find((m) => m.id === selectedId);
  const [benchmarks, setBenchmarks] = useState<TestBenchmark[]>([]);
  const [loadingBench, setLoadingBench] = useState(false);

  useEffect(() => {
    if (!metric) { setBenchmarks([]); return; }
    setLoadingBench(true);
    listBenchmarksForMetric(metric.id).then(setBenchmarks).finally(() => setLoadingBench(false));
  }, [metric?.id]);

  const handleCreate = async () => {
    if (!newMetric.name.trim()) return;
    setSaving(true);
    try {
      const m = await createTestMetric({ name: newMetric.name.trim(), unit: newMetric.unit.trim(), better_direction: newMetric.better_direction });
      setNewMetric({ name: "", unit: "", better_direction: "higher" });
      setCreating(false);
      await onReload();
      onSelect(m.id);
    } finally { setSaving(false); }
  };

  return (
    <div style={s.splitRow}>
      <div style={s.sidebar}>
        {metrics.map((m) => (
          <button key={m.id} style={{ ...s.sidebarItem, ...(m.id === selectedId ? s.sidebarItemActive : {}) }} onClick={() => onSelect(m.id)}>
            <div style={s.sidebarItemName}>{m.name}</div>
            <div style={s.sidebarItemMeta}>{m.unit || "no unit"} · {m.better_direction === "lower" ? "lower is better" : "higher is better"}</div>
          </button>
        ))}
        {!creating ? (
          <button style={s.addBtn} onClick={() => setCreating(true)}>+ New metric</button>
        ) : (
          <div style={s.inlineCreate}>
            <input value={newMetric.name} onChange={(e) => setNewMetric((p) => ({ ...p, name: e.target.value }))} placeholder="Metric name e.g. 10m Sprint" style={s.input} autoFocus />
            <input value={newMetric.unit} onChange={(e) => setNewMetric((p) => ({ ...p, unit: e.target.value }))} placeholder="Unit e.g. s, cm, kg" style={s.input} />
            <select value={newMetric.better_direction} onChange={(e) => setNewMetric((p) => ({ ...p, better_direction: e.target.value as any }))} style={s.input}>
              <option value="higher">Higher is better</option>
              <option value="lower">Lower is better</option>
            </select>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={s.smallGhost} onClick={() => setCreating(false)}>Cancel</button>
              <button style={s.smallPrimary} disabled={!newMetric.name.trim() || saving} onClick={handleCreate}>Create</button>
            </div>
          </div>
        )}
      </div>

      <div style={s.detail}>
        {!metric ? (
          <div style={s.empty}>Select or create a metric.</div>
        ) : (
          <>
            <div style={s.detailHead}>
              <input value={metric.name} onChange={async (e) => { await updateTestMetric(metric.id, { name: e.target.value }); onReload(); }} style={s.detailNameInput} />
              <button style={s.dangerBtn} onClick={async () => {
                if (!confirm(`Delete "${metric.name}"? This also removes its benchmarks. Logged results are kept.`)) return;
                await deleteTestMetric(metric.id);
                onReload();
              }}>Delete</button>
            </div>

            <div style={s.row3}>
              <Field label="Unit">
                <input value={metric.unit} onChange={async (e) => { await updateTestMetric(metric.id, { unit: e.target.value }); onReload(); }} style={s.input} />
              </Field>
              <Field label="Better direction">
                <select value={metric.better_direction} onChange={async (e) => { await updateTestMetric(metric.id, { better_direction: e.target.value as any }); onReload(); }} style={s.input}>
                  <option value="higher">Higher is better</option>
                  <option value="lower">Lower is better</option>
                </select>
              </Field>
              <Field label="Bilateral (L/R)">
                <input type="checkbox" checked={metric.is_bilateral} onChange={async (e) => { await updateTestMetric(metric.id, { is_bilateral: e.target.checked }); onReload(); }} />
              </Field>
            </div>

            <label style={s.checkboxRow}>
              <input type="checkbox" checked={metric.requires_bodyweight} onChange={async (e) => { await updateTestMetric(metric.id, { requires_bodyweight: e.target.checked }); onReload(); }} />
              Requires bodyweight (e.g. for N/kg relative scoring)
            </label>

            <div style={s.fieldLabel}>Benchmarks</div>
            {loadingBench ? (
              <div style={s.emptyHint}>Loading…</div>
            ) : (
              <BenchmarkList metricId={metric.id} benchmarks={benchmarks} onReload={() => listBenchmarksForMetric(metric.id).then(setBenchmarks)} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function BenchmarkList({ metricId, benchmarks, onReload }: {
  metricId: string; benchmarks: TestBenchmark[]; onReload: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    benchmark_type: "general_population" as "elite_youth" | "general_population",
    sex: "" as "" | "male" | "female",
    age_min: "", age_max: "", average_threshold: "", good_threshold: "", excellent_threshold: "",
  });

  const handleAdd = async () => {
    if (!form.average_threshold || !form.good_threshold || !form.excellent_threshold) return;
    await upsertBenchmark({
      test_metric_id: metricId,
      benchmark_type: form.benchmark_type,
      sex: form.sex || null,
      age_min: form.age_min ? parseFloat(form.age_min) : null,
      age_max: form.age_max ? parseFloat(form.age_max) : null,
      average_threshold: parseFloat(form.average_threshold),
      good_threshold: parseFloat(form.good_threshold),
      excellent_threshold: parseFloat(form.excellent_threshold),
    });
    setForm({ benchmark_type: "general_population", sex: "", age_min: "", age_max: "", average_threshold: "", good_threshold: "", excellent_threshold: "" });
    setAdding(false);
    onReload();
  };

  return (
    <div>
      {benchmarks.length === 0 && <div style={s.emptyHint}>No benchmarks set — results will show without rating until you add Elite Youth and General Population thresholds.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
        {benchmarks.map((b) => (
          <div key={b.id} style={s.benchmarkRow}>
            <span style={s.benchTypeTag(b.benchmark_type)}>{b.benchmark_type === "elite_youth" ? "Elite Youth" : "General Pop."}</span>
            <span style={s.benchMeta}>{b.sex ?? "any sex"} · {b.age_min ?? "any"}–{b.age_max ?? "any"} yrs</span>
            <span style={s.benchThresholds}>Avg {b.average_threshold} · Good {b.good_threshold} · Excellent {b.excellent_threshold}</span>
            <button style={s.smallGhost} onClick={async () => { await deleteBenchmark(b.id); onReload(); }}>✕</button>
          </div>
        ))}
      </div>
      {!adding ? (
        <button style={s.addBtn} onClick={() => setAdding(true)}>+ Add benchmark</button>
      ) : (
        <div style={s.benchForm}>
          <div style={s.row3}>
            <Field label="Type">
              <select value={form.benchmark_type} onChange={(e) => setForm((p) => ({ ...p, benchmark_type: e.target.value as any }))} style={s.input}>
                <option value="general_population">General population</option>
                <option value="elite_youth">Elite youth</option>
              </select>
            </Field>
            <Field label="Sex">
              <select value={form.sex} onChange={(e) => setForm((p) => ({ ...p, sex: e.target.value as any }))} style={s.input}>
                <option value="">Any</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </Field>
            <Field label="Age range">
              <div style={{ display: "flex", gap: 6 }}>
                <input value={form.age_min} onChange={(e) => setForm((p) => ({ ...p, age_min: e.target.value }))} placeholder="Min" style={{ ...s.input, width: 60 }} />
                <input value={form.age_max} onChange={(e) => setForm((p) => ({ ...p, age_max: e.target.value }))} placeholder="Max" style={{ ...s.input, width: 60 }} />
              </div>
            </Field>
          </div>
          <div style={s.fieldLabel}>4-tier thresholds — a result worse than Average is rated Needs Work automatically</div>
          <div style={s.row3}>
            <Field label="Average"><input value={form.average_threshold} onChange={(e) => setForm((p) => ({ ...p, average_threshold: e.target.value }))} style={s.input} /></Field>
            <Field label="Good"><input value={form.good_threshold} onChange={(e) => setForm((p) => ({ ...p, good_threshold: e.target.value }))} style={s.input} /></Field>
            <Field label="Excellent"><input value={form.excellent_threshold} onChange={(e) => setForm((p) => ({ ...p, excellent_threshold: e.target.value }))} style={s.input} /></Field>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={s.smallGhost} onClick={() => setAdding(false)}>Cancel</button>
            <button style={s.smallPrimary} onClick={handleAdd}>Save benchmark</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}><div style={s.fieldLabel}>{label}</div>{children}</div>;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: any = {
  page: { maxWidth: 980 },
  headRow: { marginBottom: 16 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, margin: 0 },
  subtitle: { fontSize: 13, color: "var(--mute)", marginTop: 4, maxWidth: 600 },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 },
  tabs: { display: "flex", gap: 8, marginBottom: 16 },
  tab: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  tabActive: { background: "var(--accent-dim)", borderColor: "var(--accent)", color: "var(--accent)" },
  empty: { color: "var(--mute)", fontSize: 13, padding: "24px 0" },
  emptyHint: { fontSize: 12, color: "var(--mute)", fontStyle: "italic", marginBottom: 8 },
  splitRow: { display: "flex", gap: 20 },
  sidebar: { width: 240, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 },
  sidebarItem: { textAlign: "left", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px", cursor: "pointer" },
  sidebarItemActive: { borderColor: "var(--accent)", background: "var(--accent-dim)" },
  sidebarItemName: { fontSize: 13, fontWeight: 700, color: "var(--text)" },
  sidebarItemMeta: { fontSize: 11, color: "var(--mute)", marginTop: 2 },
  addBtn: { background: "transparent", border: "1px dashed var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 0", fontSize: 12, cursor: "pointer" },
  inlineCreate: { display: "flex", flexDirection: "column", gap: 6, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, padding: 10 },
  input: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6, padding: "6px 8px", fontSize: 12, width: "100%" },
  smallGhost: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer", flex: 1 },
  smallPrimary: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", flex: 1 },
  detail: { flex: 1, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 12 },
  detailHead: { display: "flex", gap: 8, alignItems: "center" },
  detailNameInput: { flex: 1, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 16, fontWeight: 700 },
  dangerBtn: { background: "transparent", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "8px 12px", fontSize: 12, cursor: "pointer" },
  textarea: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 13, resize: "vertical" },
  fieldLabel: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.05em" },
  metricCheckList: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" },
  metricCheckRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)" },
  metricUnitTag: { fontSize: 11, color: "var(--mute)", marginLeft: "auto" },
  checkboxRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)" },
  row3: { display: "flex", gap: 10 },
  primaryBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", alignSelf: "flex-start" },
  benchmarkRow: { display: "flex", alignItems: "center", gap: 10, background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px", fontSize: 12 },
  benchTypeTag: (type: string) => ({
    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5,
    background: type === "elite_youth" ? "#2a2240" : "#1a2c38",
    color: type === "elite_youth" ? "#B388FF" : "#4DC3FF",
  }),
  benchMeta: { color: "var(--mute)" },
  benchThresholds: { marginLeft: "auto", color: "var(--text)" },
  benchForm: { display: "flex", flexDirection: "column", gap: 10, background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: 12 },
};

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listProgrammes, deleteProgramme, createProgramme } from "@/lib/data/programmes";
import type { Programme } from "@/types";

export default function ProgrammesPage() {
  const router = useRouter();
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  // "+ Build New Programme" (0132): name + length, then straight into the builder.
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWeeks, setNewWeeks] = useState(8);
  const [creating, setCreating] = useState(false);
  const handleCreate = async () => {
    setCreating(true);
    setError("");
    try {
      const p = await createProgramme({ name: newName, weeks: newWeeks });
      router.push(`/programmes/${p.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the programme");
      setCreating(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setProgrammes(await listProgrammes());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load programmes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (p: Programme) => {
    if (!confirm(`Delete programme "${p.name}"?`)) return;
    try {
      await deleteProgramme(p.id);
      setProgrammes((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete programme");
    }
  };

  const filtered = query.trim()
    ? programmes.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
    : programmes;

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Programme Library</h1>
          <p style={styles.subtitle}>
            Build a programme week by week from your templates, or save a date range from an athlete&apos;s calendar with
            &quot;Save as programme&quot;.
          </p>
        </div>
        <button style={styles.primaryBtn} onClick={() => { setNewOpen(true); setNewName(""); }}>+ Build New Programme</button>
      </div>

      {newOpen && (
        <div style={styles.overlay} onClick={() => !creating && setNewOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTitle}>Build a new programme</div>
            <div style={styles.fieldLabel}>Name</div>
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. 8-Week Off-Season Strength" style={{ ...styles.input, marginBottom: 12 }} onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }} />
            <div style={styles.fieldLabel}>Length</div>
            <select value={newWeeks} onChange={(e) => setNewWeeks(Number(e.target.value))} style={{ ...styles.input, marginBottom: 6 }}>
              {[1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 52].map((n) => <option key={n} value={n}>{n} week{n === 1 ? "" : "s"}</option>)}
            </select>
            <div style={{ fontSize: 12, color: "var(--mute)", marginBottom: 14 }}>You can add or remove weeks later.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...styles.ghostBtn, flex: 1 }} onClick={() => setNewOpen(false)} disabled={creating}>Cancel</button>
              <button style={{ ...styles.primaryBtn, flex: 2 }} onClick={handleCreate} disabled={creating}>{creating ? "Creating…" : "Create and start building"}</button>
            </div>
          </div>
        </div>
      )}

      {error && <div style={styles.errorBox}>{error}</div>}

      {programmes.length > 0 && (
        <input
          placeholder="Search programmes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ ...styles.input, marginBottom: 16, maxWidth: 320 }}
        />
      )}

      {loading ? (
        <div style={styles.empty}>Loading…</div>
      ) : !programmes.length ? (
        <div style={styles.empty}>
          No programmes yet. Press &quot;+ Build New Programme&quot; to start one.
        </div>
      ) : !filtered.length ? (
        <div style={styles.empty}>No programmes match &quot;{query}&quot;.</div>
      ) : (
        <div style={styles.list}>
          {filtered.map((p) => (
            <div key={p.id} style={styles.row} onClick={() => router.push(`/programmes/${p.id}`)}>
              <div style={styles.rowAvatar}>📆</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.rowName}>{p.name}</div>
                <div style={styles.rowMeta}>
                  {p.sessions?.length ?? 0} session{(p.sessions?.length ?? 0) !== 1 ? "s" : ""} ·{" "}
                  {p.assigned_to?.length ?? 0} assigned
                </div>
              </div>
              <button
                style={styles.deleteBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(p);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 700 },
  primaryBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 14, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 10, padding: "10px 14px", fontSize: 14, cursor: "pointer" },
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 400 },
  modalTitle: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, marginBottom: 14 },
  fieldLabel: { fontSize: 11, color: "var(--mute)", marginBottom: 4, fontWeight: 700 },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 16 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, margin: 0 },
  subtitle: { fontSize: 13, color: "var(--mute)", marginTop: 4, maxWidth: 420 },
  input: {
    width: "100%",
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 14,
  },
  errorBox: {
    background: "#2a0c0c",
    border: "1px solid #FF6B6B44",
    color: "#FF6B6B",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    marginBottom: 16,
  },
  empty: { color: "var(--mute)", fontSize: 14, padding: "40px 0", textAlign: "center" },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: "12px 14px",
    cursor: "pointer",
  },
  rowAvatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: "#1a2840",
    color: "var(--blue)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    flexShrink: 0,
  },
  rowName: { fontWeight: 700, fontSize: 14, color: "var(--text)" },
  rowMeta: { fontSize: 12, color: "var(--mute)", marginTop: 2 },
  deleteBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 18, cursor: "pointer" },
};

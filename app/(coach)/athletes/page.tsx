"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listAthletes,
  listArchivedAthletes,
  createAthlete,
  deleteAthlete,
  deleteAthletes,
  archiveAthlete,
  unarchiveAthlete,
  toggleLiveGroup,
  clearLiveGroup,
} from "@/lib/data/athletes";
import ExportModal from "@/components/ExportModal";
import Avatar from "@/components/Avatar";
import { getOrgSettings } from "@/lib/data/settings";
import { rtpMeta } from "@/lib/rtp";
import type { Athlete } from "@/types";

export default function AthletesPage() {
  const router = useRouter();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [archivedAthletes, setArchivedAthletes] = useState<Athlete[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [newBodyweight, setNewBodyweight] = useState("");
  const [saving, setSaving] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [rtpEnabled, setRtpEnabled] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [active, archived] = await Promise.all([listAthletes(), listArchivedAthletes()]);
      setAthletes(active);
      setArchivedAthletes(archived);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load athletes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    getOrgSettings()
      .then((sett) => setRtpEnabled(sett.load_monitoring_enabled && sett.load_monitoring.rtp_status))
      .catch(() => {});
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const athlete = await createAthlete(newName.trim(), newGroup.trim(), newBodyweight ? parseFloat(newBodyweight) : null);
      setAthletes((prev) => [...prev, athlete].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setNewGroup("");
      setNewBodyweight("");
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add athlete");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (athlete: Athlete) => {
    if (!confirm(`Archive ${athlete.name}? They'll be hidden from your active roster, but nothing is deleted - you can restore them any time.`)) return;
    try {
      await archiveAthlete(athlete.id);
      setAthletes((prev) => prev.filter((a) => a.id !== athlete.id));
      setArchivedAthletes((prev) => [...prev, { ...athlete, archived: true }].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not archive athlete");
    }
  };

  const handleToggleStar = async (athlete: Athlete, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !athlete.in_live_group;
    setAthletes((prev) => prev.map((a) => (a.id === athlete.id ? { ...a, in_live_group: next } : a)));
    try {
      await toggleLiveGroup(athlete.id, next);
    } catch (err) {
      setAthletes((prev) => prev.map((a) => (a.id === athlete.id ? { ...a, in_live_group: !next } : a)));
      setError(err instanceof Error ? err.message : "Could not update live group");
    }
  };

  const handleClearLiveGroup = async () => {
    const starred = athletes.filter((a) => a.in_live_group);
    if (!starred.length) return;
    if (!confirm(`Clear the live group? ${starred.length} athlete${starred.length === 1 ? "" : "s"} will be unstarred.`)) return;
    setAthletes((prev) => prev.map((a) => (a.in_live_group ? { ...a, in_live_group: false } : a)));
    try {
      await clearLiveGroup();
    } catch (err) {
      setAthletes((prev) => prev.map((a) => (starred.some((s) => s.id === a.id) ? { ...a, in_live_group: true } : a)));
      setError(err instanceof Error ? err.message : "Could not clear the live group");
    }
  };

  const handleUnarchive = async (athlete: Athlete) => {
    try {
      await unarchiveAthlete(athlete.id);
      setArchivedAthletes((prev) => prev.filter((a) => a.id !== athlete.id));
      setAthletes((prev) => [...prev, { ...athlete, archived: false }].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore athlete");
    }
  };

  const handleDelete = async (athlete: Athlete) => {
    if (
      !confirm(
        `Permanently delete ${athlete.name} and every session they've ever had? This cannot be undone - if you just want to hide them, use Archive instead.`
      )
    )
      return;
    try {
      await deleteAthlete(athlete.id);
      setAthletes((prev) => prev.filter((a) => a.id !== athlete.id));
      setArchivedAthletes((prev) => prev.filter((a) => a.id !== athlete.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove athlete");
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleShowArchivedToggle = () => {
    exitSelectMode();
    setShowArchived((v) => !v);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    const names = archivedAthletes.filter((a) => selectedIds.has(a.id)).map((a) => a.name);
    if (
      !confirm(
        `Permanently delete ${ids.length} athlete${ids.length !== 1 ? "s" : ""} and every session they've ever had?\n\n${names.join(", ")}\n\nThis cannot be undone.`
      )
    )
      return;
    setBulkDeleting(true);
    try {
      await deleteAthletes(ids);
      setArchivedAthletes((prev) => prev.filter((a) => !selectedIds.has(a.id)));
      exitSelectMode();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete athletes");
    } finally {
      setBulkDeleting(false);
    }
  };

  const activeList = athletes;
  const visibleList = showArchived ? archivedAthletes : activeList;

  const filtered = query.trim()
    ? visibleList.filter(
        (a) =>
          a.name.toLowerCase().includes(query.trim().toLowerCase()) ||
          (a.group || "").toLowerCase().includes(query.trim().toLowerCase())
      )
    : visibleList;

  const allFilteredSelected = filtered.length > 0 && filtered.every((a) => selectedIds.has(a.id));
  const handleSelectAllToggle = () => {
    setSelectedIds(allFilteredSelected ? new Set() : new Set(filtered.map((a) => a.id)));
  };

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h1 style={styles.title}>Athletes</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {!showArchived && athletes.some((a) => a.in_live_group) && (
            <button style={styles.ghostBtn} onClick={handleClearLiveGroup} title="Unstar every athlete currently in the live group">
              ☆ Clear live group ({athletes.filter((a) => a.in_live_group).length})
            </button>
          )}
          <button style={styles.ghostBtn} onClick={() => setExportOpen(true)}>
            Export all
          </button>
          <button style={styles.ghostBtn} onClick={handleShowArchivedToggle}>
            {showArchived ? "← Back to active" : `Archived (${archivedAthletes.length})`}
          </button>
          {showArchived && archivedAthletes.length > 0 && (
            <button
              style={styles.ghostBtn}
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            >
              {selectMode ? "Cancel" : "Select"}
            </button>
          )}
          {!showArchived && (
            <button style={styles.primaryBtn} onClick={() => setAdding((v) => !v)}>
              {adding ? "Cancel" : "+ Add athlete"}
            </button>
          )}
        </div>
      </div>

      {selectMode && showArchived && (
        <div style={styles.selectToolbar}>
          <button style={styles.selectAllBtn} onClick={handleSelectAllToggle}>
            {allFilteredSelected ? "Deselect all" : `Select all (${filtered.length})`}
          </button>
          <span style={styles.selectedCount}>{selectedIds.size} selected</span>
          <button
            style={{ ...styles.bulkDeleteBtn, opacity: !selectedIds.size || bulkDeleting ? 0.5 : 1, cursor: !selectedIds.size || bulkDeleting ? "not-allowed" : "pointer" }}
            disabled={!selectedIds.size || bulkDeleting}
            onClick={handleBulkDelete}
          >
            {bulkDeleting ? "Deleting…" : `Delete ${selectedIds.size || ""}`}
          </button>
        </div>
      )}

      {error && <div style={styles.errorBox}>{error}</div>}

      {showArchived && (
        <p style={styles.archivedNote}>
          Archived athletes are hidden from your active roster, the dashboard, and assignment pickers - but
          nothing about them has been deleted. Restore one to bring it back into normal use.
        </p>
      )}

      {adding && !showArchived && (
        <form onSubmit={handleAdd} style={styles.addForm}>
          <input
            autoFocus
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={styles.input}
          />
          <input
            placeholder="Group (e.g. U15 Squad) - optional"
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            style={styles.input}
          />
          <input
            type="number"
            step="0.1"
            placeholder="Bodyweight kg - optional"
            value={newBodyweight}
            onChange={(e) => setNewBodyweight(e.target.value)}
            style={styles.input}
          />
          <button type="submit" disabled={saving || !newName.trim()} style={styles.primaryBtn}>
            {saving ? "Adding…" : "Add athlete"}
          </button>
        </form>
      )}

      {visibleList.length > 5 && (
        <input
          placeholder="Search athletes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ ...styles.input, marginBottom: 16, maxWidth: 320 }}
        />
      )}

      {loading ? (
        <div style={styles.empty}>Loading…</div>
      ) : !visibleList.length ? (
        <div style={styles.empty}>
          {showArchived ? "No archived athletes." : "No athletes yet. Add your first one above."}
        </div>
      ) : !filtered.length ? (
        <div style={styles.empty}>No athletes match &quot;{query}&quot;.</div>
      ) : (
        <div style={styles.grid}>
          {filtered.map((athlete) => {
            const isSelected = selectedIds.has(athlete.id);
            const inSelect = selectMode && showArchived;
            return (
            <div
              key={athlete.id}
              style={{ ...styles.card, ...(inSelect && isSelected ? styles.cardSelected : {}) }}
              onClick={() => (inSelect ? handleToggleSelect(athlete.id) : router.push(`/athletes/${athlete.id}`))}
            >
              {inSelect ? (
                <div style={{ ...styles.checkbox, ...(isSelected ? styles.checkboxOn : {}) }}>
                  {isSelected ? "✓" : ""}
                </div>
              ) : (
                <Avatar name={athlete.name} avatarUrl={athlete.avatar_url} size={38} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.cardName}>{athlete.name}</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  {athlete.group && <div style={styles.cardGroup}>{athlete.group}</div>}
                  {rtpEnabled && athlete.rtp_status && athlete.rtp_status !== "available" && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: rtpMeta(athlete.rtp_status).color, background: `${rtpMeta(athlete.rtp_status).color}22`, borderRadius: 4, padding: "1px 6px" }}>
                      {rtpMeta(athlete.rtp_status).label}
                    </span>
                  )}
                </div>
              </div>
              {!showArchived && (
                <button
                  style={{ ...styles.starBtn, color: athlete.in_live_group ? "var(--warn)" : "var(--mute)" }}
                  onClick={(e) => handleToggleStar(athlete, e)}
                  title={athlete.in_live_group ? "Remove from live group" : "Add to live group"}
                >
                  {athlete.in_live_group ? "★" : "☆"}
                </button>
              )}
              {!inSelect && (showArchived ? (
                <>
                  <button
                    style={styles.restoreBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUnarchive(athlete);
                    }}
                  >
                    Restore
                  </button>
                  <button
                    style={styles.deleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(athlete);
                    }}
                    title="Permanently delete"
                  >
                    ×
                  </button>
                </>
              ) : (
                <button
                  style={styles.archiveBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleArchive(athlete);
                  }}
                  title="Archive"
                >
                  📦
                </button>
              ))}
            </div>
            );
          })}
        </div>
      )}

      {exportOpen && (
        <ExportModal
          mode="all"
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900 },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, margin: 0 },
  flashBox: { background: "var(--good-dim)", border: "1px solid var(--good)", color: "var(--good)", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 16 },
  primaryBtn: {
    background: "var(--accent)",
    color: "#0a1420",
    border: "none",
    borderRadius: 10,
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  ghostBtn: {
    background: "transparent",
    border: "1px solid var(--line)",
    color: "var(--mute)",
    borderRadius: 10,
    padding: "10px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  archivedNote: { fontSize: 13, color: "var(--mute)", lineHeight: 1.5, marginBottom: 16, maxWidth: 560 },
  errorBox: {
    background: "#2a0c0c",
    border: "1px solid #FF6B6B44",
    color: "#FF6B6B",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    marginBottom: 16,
  },
  addForm: {
    display: "flex",
    gap: 8,
    marginBottom: 20,
    flexWrap: "wrap",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: 14,
  },
  selectToolbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: "10px 14px",
  },
  selectAllBtn: {
    background: "transparent",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 8,
    padding: "7px 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  selectedCount: { fontSize: 13, color: "var(--mute)", flex: 1 },
  bulkDeleteBtn: {
    background: "#FF6B6B22",
    border: "1px solid #FF6B6B66",
    color: "#FF6B6B",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 700,
  },
  input: {
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 14,
    flex: 1,
    minWidth: 160,
  },
  empty: { color: "var(--mute)", fontSize: 14, padding: "40px 0", textAlign: "center" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 },
  card: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: 14,
    cursor: "pointer",
  },
  cardSelected: { borderColor: "var(--accent)", background: "var(--accent-dim)" },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    border: "1px solid var(--line)",
    background: "var(--ink)",
    color: "#0a1420",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 13,
    flexShrink: 0,
  },
  checkboxOn: { background: "var(--accent)", borderColor: "var(--accent)" },
  cardName: { fontWeight: 700, fontSize: 15, color: "var(--text)" },
  cardGroup: { fontSize: 12, color: "var(--mute)", marginTop: 2 },
  deleteBtn: {
    background: "transparent",
    border: "none",
    color: "var(--mute)",
    fontSize: 18,
    cursor: "pointer",
    padding: 4,
  },
  archiveBtn: {
    background: "transparent",
    border: "none",
    color: "var(--mute)",
    fontSize: 16,
    cursor: "pointer",
    padding: 4,
    flexShrink: 0,
  },
  starBtn: {
    background: "transparent",
    border: "none",
    fontSize: 20,
    cursor: "pointer",
    padding: "0 2px",
    flexShrink: 0,
    lineHeight: 1,
  },
  restoreBtn: {
    background: "var(--accent-dim)",
    border: "none",
    color: "var(--accent)",
    borderRadius: 7,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    flexShrink: 0,
  },
};

"use client";

import { useState, useEffect } from "react";

interface LibraryExercise {
  id: string;
  name: string;
  video_url: string;
}

interface Props {
  token: string;
  sessionId: string;
  exerciseId: string;
  currentName: string;
  alternativeNames: string[];
  swappedFrom: string | null;
  onDone: () => void;
  onClose: () => void;
}

export default function AthleteSwapExerciseModal({
  token, sessionId, exerciseId, currentName, alternativeNames, swappedFrom, onDone, onClose,
}: Props) {
  const [library, setLibrary] = useState<LibraryExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/athlete-link/library-exercises?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setLibrary(d.library ?? []);
      })
      .catch((e) => setError(e.message ?? "Could not load library"))
      .finally(() => setLoading(false));
  }, [token]);

  const performSwap = async (name: string) => {
    setWorking(name);
    setError("");
    try {
      const videoUrl = library.find((l) => l.name === name)?.video_url ?? "";
      const res = await fetch("/api/athlete-link/swap-exercise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, sessionId, exerciseId, name, videoUrl }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Could not swap exercise");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not swap exercise");
      setWorking(null);
    }
  };

  const performSkip = async () => {
    setWorking("__skip__");
    setError("");
    try {
      const res = await fetch("/api/athlete-link/opt-out-exercise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, sessionId, exerciseId, optedOut: true }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Could not update");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update");
      setWorking(null);
    }
  };

  const results = library
    .filter((l) => l.name.toLowerCase() !== currentName.trim().toLowerCase())
    .filter((l) => !search.trim() || l.name.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 30);

  return (
    <div style={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.modal}>
        <div style={s.header}>
          <div>
            <div style={s.title}>🔀 Swap &quot;{currentName}&quot;</div>
            <div style={s.subtitle}>Only affects this session — your regular programme stays the same.</div>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {error && <div style={s.errorBox}>{error}</div>}

        <div style={s.body}>
          {swappedFrom && (
            <button
              style={s.revertBtn}
              onClick={() => performSwap(swappedFrom)}
              disabled={!!working}
            >
              {working === swappedFrom ? "Reverting…" : `↩ Revert to "${swappedFrom}"`}
            </button>
          )}

          {alternativeNames.length > 0 && (
            <div>
              <div style={s.sectionLabel}>Coach-approved alternatives</div>
              <div style={s.chipsRow}>
                {alternativeNames.map((name) => (
                  <button
                    key={name}
                    style={s.chip}
                    onClick={() => performSwap(name)}
                    disabled={!!working}
                  >
                    {working === name ? "Swapping…" : name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div style={s.sectionLabel}>Or search your library</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search exercises…"
              style={s.searchInput}
            />
            {loading ? (
              <div style={s.loading}>Loading…</div>
            ) : (
              <div style={s.results}>
                {results.map((entry) => (
                  <button
                    key={entry.id}
                    style={s.resultItem}
                    onClick={() => performSwap(entry.name)}
                    disabled={!!working}
                  >
                    {working === entry.name ? "Swapping…" : `+ ${entry.name}`}
                  </button>
                ))}
                {!results.length && (
                  <div style={s.empty}>
                    {library.length === 0 ? "No exercises in your library yet." : "No matches."}
                  </div>
                )}
              </div>
            )}
          </div>

          <button style={s.skipBtn} onClick={performSkip} disabled={!!working}>
            {working === "__skip__" ? "Skipping…" : "⏭ Skip this exercise (no replacement)"}
          </button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 300, padding: 16,
  },
  modal: {
    background: "var(--panel)", border: "1px solid var(--line)",
    borderRadius: 16, width: "100%", maxWidth: 460,
    maxHeight: "85vh", display: "flex", flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    padding: "16px 18px 12px", borderBottom: "1px solid var(--line)", flexShrink: 0,
  },
  title: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  subtitle: { fontSize: 12, color: "var(--mute)", marginTop: 4, lineHeight: 1.4 },
  closeBtn: {
    background: "transparent", border: "none", color: "var(--mute)",
    fontSize: 18, cursor: "pointer", padding: 4,
  },
  errorBox: {
    background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B",
    borderRadius: 8, padding: "8px 12px", fontSize: 13, margin: "10px 18px 0",
  },
  body: { overflowY: "auto", padding: "14px 18px 18px", display: "flex", flexDirection: "column", gap: 14 },
  revertBtn: {
    background: "var(--accent-dim)", border: "1px solid var(--accent)44", color: "var(--accent)",
    borderRadius: 8, padding: "10px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", width: "100%",
  },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 6 },
  chipsRow: { display: "flex", flexWrap: "wrap" as const, gap: 6 },
  chip: {
    background: "var(--accent-dim)", border: "1px solid var(--accent)44", color: "var(--accent)",
    borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
  searchInput: {
    width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)",
    borderRadius: 8, padding: "9px 12px", fontSize: 14, marginBottom: 6,
  },
  loading: { fontSize: 13, color: "var(--mute)", padding: "8px 0" },
  results: { display: "flex", flexDirection: "column" as const, gap: 2, maxHeight: 220, overflowY: "auto" as const },
  resultItem: {
    background: "transparent", border: "none", color: "var(--text)",
    fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" as const,
    padding: "8px 8px", borderRadius: 6,
  },
  empty: { fontSize: 12, color: "var(--mute)", fontStyle: "italic" as const, padding: "6px 2px" },
  skipBtn: {
    background: "transparent", border: "1px solid #FF6B6B44", color: "#FF6B6B",
    borderRadius: 8, padding: "11px 0", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
};

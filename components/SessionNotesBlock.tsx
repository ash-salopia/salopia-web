"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { listNoteTemplates, type NoteTemplate } from "@/lib/data/note-templates";
import { linkify } from "@/lib/linkify";

interface Props {
  value: string;
  onChange: (val: string) => void;
  onBlur?: () => void;
  readOnly?: boolean;
  sessionType?: string;
  label?: string;
  icon?: string;
  placeholder?: string;
  // Coach note templates are read via the browser Supabase client under
  // RLS, which requires an authenticated coach session — the athlete
  // app has no such session (share-token only), so its "Your Notes"
  // instance must never attempt this fetch. Without this flag it fails
  // with a 401 on every open, silently swallowed but still a real
  // failed request. Coach-side callers keep the default (true).
  enableTemplates?: boolean;
  // Optional video link (demo/technique clip) attached to this note
  // block (0105) - shown as a "▸ Watch video" link when read-only, or
  // an editable URL field alongside the notes textarea otherwise.
  // Omit both props entirely (as VoiceSessionModal's callers do) to
  // hide the field completely rather than show an always-empty one.
  videoUrl?: string;
  onVideoUrlChange?: (url: string) => void;
  // Which block this is, for template filtering (0106) - "general" is
  // the default so every existing caller (the main Session Notes box,
  // athlete_notes, VoiceSessionModal) keeps its current behaviour
  // unchanged. A "warm_up"/"cool_down"-tagged template is content
  // specifically FOR that block, so it should only ever show up there -
  // previously every block filtered by session type alone, so a
  // warm-up template leaked into the general Session Notes and
  // Cool-down pickers too (reported live).
  noteKind?: "general" | "warmup" | "cooldown";
}

export default function SessionNotesBlock({
  value,
  onChange,
  onBlur,
  readOnly = false,
  sessionType,
  label = "Session Notes",
  icon = "📋",
  placeholder = "Warm-up protocol, coaching cues, drill progressions…",
  enableTemplates = true,
  videoUrl,
  onVideoUrlChange,
  noteKind = "general",
}: Props) {
  const hasVideo = videoUrl !== undefined;
  const [isOpen, setIsOpen] = useState(!!value || !!videoUrl);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!readOnly && enableTemplates) {
      listNoteTemplates().then(setTemplates).catch(() => {});
    }
  }, [readOnly, enableTemplates]);

  function applyTemplate(t: NoteTemplate) {
    onChange(value ? `${value}\n\n${t.content}` : t.content);
    if (t.video_url && onVideoUrlChange) onVideoUrlChange(t.video_url);
    setShowTemplates(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  if (readOnly && !value && !videoUrl) return null;

  const lineCount = value ? value.split("\n").length : 0;

  // Filter templates by which block this is first, then (for the
  // general block only) by session type - "warm_up"/"cool_down" are
  // content specifically for that block, not for session type at all.
  const relevantTemplates = templates.filter(t => {
    const cats = t.categories ?? [];
    if (cats.includes("general")) return true;
    if (noteKind === "warmup") return cats.includes("warm_up");
    if (noteKind === "cooldown") return cats.includes("cool_down");
    return (
      (sessionType === "power_speed" && cats.includes("power_speed")) ||
      (sessionType === "strength" && cats.includes("strength")) ||
      (sessionType === "cardio" && cats.includes("cardio")) ||
      (sessionType === "hyrox" && cats.includes("hyrox")) ||
      (sessionType === "sport" && cats.includes("sport")) ||
      (sessionType === "recovery" && cats.includes("recovery"))
    );
  });

  return (
    <div style={s.wrap}>
      <button style={s.header} onClick={() => setIsOpen(o => !o)}>
        <span style={s.headerLeft}>
          <span style={s.icon}>{icon}</span>
          <span style={s.label}>{label}</span>
          {value && <span style={s.badge}>{lineCount} line{lineCount !== 1 ? "s" : ""}</span>}
          {!value && videoUrl && <span style={s.badge}>🎥 video</span>}
        </span>
        <span style={{ ...s.chevron, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
      </button>

      {isOpen && (
        <div style={s.body}>
          {!readOnly && enableTemplates && (
            relevantTemplates.length > 0 ? (
              <div style={s.templateRow}>
                <button style={s.templateBtn} onClick={() => setShowTemplates(v => !v)}>
                  Load template ▾
                </button>
                {showTemplates && (
                  <div style={s.templateDropdown}>
                    {relevantTemplates.map(t => (
                      <button key={t.id} style={s.templateItem} onClick={() => applyTemplate(t)}>
                        {t.name}{t.video_url ? " 🎥" : ""}
                      </button>
                    ))}
                    <button style={{ ...s.templateItem, color: "var(--mute)", borderTop: "1px solid var(--line)" }}
                      onClick={() => setShowTemplates(false)}>
                      Close
                    </button>
                  </div>
                )}
              </div>
            ) : (
              // No templates saved yet (or none tagged for this session
              // type) - without this, the whole template row just silently
              // vanishes and there's no way to discover the feature exists
              // at all (reported live: "no way to load a note template
              // into a session"). Points straight at the management page
              // rather than leaving a dead end.
              <Link href="/templates" style={s.templateEmptyLink}>
                + No note templates yet — create one
              </Link>
            )
          )}

          {readOnly ? (
            <>
              {value && <pre style={s.readOnlyText}>{linkify(value)}</pre>}
              {videoUrl && (
                <a href={videoUrl} target="_blank" rel="noopener noreferrer" style={s.videoLink}>
                  ▸ Watch video
                </a>
              )}
            </>
          ) : (
            <>
              <textarea
                ref={textareaRef}
                value={value}
                onChange={e => onChange(e.target.value)}
                onBlur={onBlur}
                placeholder={placeholder}
                rows={6}
                style={s.textarea}
              />
              {hasVideo && (
                <input
                  value={videoUrl}
                  onChange={e => onVideoUrlChange?.(e.target.value)}
                  onBlur={onBlur}
                  placeholder="🎥 Paste a video link (optional)"
                  style={s.videoInput}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", marginBottom: 12 },
  header: { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--ink)", border: "none", padding: "10px 14px", cursor: "pointer", color: "var(--text)" },
  headerLeft: { display: "flex", alignItems: "center", gap: 8 },
  icon: { fontSize: 14 },
  label: { fontSize: 13, fontWeight: 600, color: "var(--mute)" },
  badge: { fontSize: 10, background: "var(--accent-dim)", color: "var(--accent)", borderRadius: 4, padding: "2px 6px", fontWeight: 700 },
  chevron: { fontSize: 22, color: "var(--mute)", transition: "transform 0.2s" },
  body: { background: "var(--panel)", padding: "10px 14px 14px", display: "flex", flexDirection: "column" as const, gap: 8 },
  templateRow: { position: "relative" as const },
  templateBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" },
  templateEmptyLink: { fontSize: 11, fontWeight: 600, color: "var(--accent)", textDecoration: "none", alignSelf: "flex-start" as const },
  templateDropdown: { position: "absolute" as const, top: "calc(100% + 4px)", left: 0, zIndex: 20, background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 8, padding: 4, minWidth: 200, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column" as const },
  templateItem: { background: "transparent", border: "none", color: "var(--text)", padding: "8px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left" as const, borderRadius: 6 },
  textarea: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "10px 12px", fontSize: 16, lineHeight: 1.6, resize: "vertical" as const, fontFamily: "monospace", minHeight: 120 },
  readOnlyText: { fontSize: 13, color: "var(--mute)", whiteSpace: "pre-wrap" as const, fontFamily: "inherit", lineHeight: 1.6, margin: 0 },
  videoInput: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 12px", fontSize: 13 },
  videoLink: { fontSize: 13, fontWeight: 600, color: "var(--accent)", textDecoration: "none", alignSelf: "flex-start" as const },
};

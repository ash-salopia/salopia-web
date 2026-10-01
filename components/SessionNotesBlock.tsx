"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { listNoteTemplates, saveNoteTemplate, type NoteTemplate, type NoteCategory } from "@/lib/data/note-templates";
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
  // Saving the note just written here as a reusable template, rather
  // than only ever loading one in - previously the only way to create
  // a template was the separate /templates management page, so a good
  // note typed straight into a session had to be re-typed there from
  // scratch to reuse it (0114).
  const [savingAsTemplate, setSavingAsTemplate] = useState(false);
  const [templateNameDraft, setTemplateNameDraft] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateSavedFlash, setTemplateSavedFlash] = useState(false);
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

  // Same category this block already filters "Load template" by -
  // saving here tags the new template so it shows back up in exactly
  // this picker (and any other that matches), without the coach having
  // to pick a category by hand for the common case.
  const defaultCategory: NoteCategory =
    noteKind === "warmup" ? "warm_up"
    : noteKind === "cooldown" ? "cool_down"
    : (["strength", "power_speed", "cardio", "hyrox", "sport", "recovery"] as const).includes(sessionType as any)
      ? (sessionType as NoteCategory)
      : "general";

  async function handleSaveAsTemplate() {
    if (!templateNameDraft.trim()) return;
    setTemplateSaving(true);
    try {
      const saved = await saveNoteTemplate({
        name: templateNameDraft.trim(),
        content: value,
        categories: [defaultCategory],
        sort_order: templates.length,
        video_url: videoUrl ?? "",
      });
      setTemplates((prev) => [...prev, saved]);
      setSavingAsTemplate(false);
      setTemplateNameDraft("");
      setTemplateSavedFlash(true);
      setTimeout(() => setTemplateSavedFlash(false), 2500);
    } catch {
      // Swallowed deliberately - this is a convenience save, not the
      // coach's actual note (already safely saved on the session itself
      // via the normal onChange/onBlur path regardless of this failing).
    } finally {
      setTemplateSaving(false);
    }
  }

  if (readOnly && !value && !videoUrl) return null;

  const lineCount = value ? value.split("\n").length : 0;
  // Brief one-line preview shown on the collapsed header (0109) -
  // previously a collapsed block gave no hint at all of what it
  // contained, just a line count. First non-blank line, trimmed short;
  // full text is still only ever a tap away via the dropdown itself.
  const previewSource = value.split("\n").find((l) => l.trim()) ?? "";
  const preview = previewSource.length > 50 ? previewSource.slice(0, 50) + "…" : previewSource;

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
          {!isOpen && preview && <span style={s.preview}>{preview}</span>}
          {value && <span style={s.badge}>{lineCount} line{lineCount !== 1 ? "s" : ""}</span>}
          {!value && videoUrl && <span style={s.badge}>🎥 video</span>}
        </span>
        <span style={{ ...s.chevron, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
      </button>

      {isOpen && (
        <div style={s.body}>
          {!readOnly && enableTemplates && (
            <div style={s.templateRow}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                {relevantTemplates.length > 0 && (
                  <button style={s.templateBtn} onClick={() => setShowTemplates(v => !v)}>
                    Load template ▾
                  </button>
                )}
                {/* Save whatever's typed here as a reusable template -
                    previously the only way to create one was the
                    separate /templates page, so a good note typed
                    straight into a session had to be re-typed there
                    from scratch to reuse it (0114). */}
                {value.trim().length > 0 && (
                  <button style={s.templateBtn} onClick={() => setSavingAsTemplate(v => !v)}>
                    💾 Save as template
                  </button>
                )}
                {relevantTemplates.length === 0 && !value.trim() && (
                  // No templates saved yet (or none tagged for this session
                  // type) and nothing here yet to save either - without
                  // this, the whole row just silently vanishes and there's
                  // no way to discover the feature exists at all (reported
                  // live: "no way to load a note template into a
                  // session"). Points straight at the management page.
                  <Link href="/templates" style={s.templateEmptyLink}>
                    + No note templates yet — create one
                  </Link>
                )}
              </div>

              {showTemplates && relevantTemplates.length > 0 && (
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

              {savingAsTemplate && (
                <div style={s.saveTemplateRow}>
                  <input
                    value={templateNameDraft}
                    onChange={e => setTemplateNameDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleSaveAsTemplate(); if (e.key === "Escape") setSavingAsTemplate(false); }}
                    placeholder="Template name, e.g. Sprint Warm-Up Protocol"
                    autoFocus
                    style={s.saveTemplateInput}
                  />
                  <button
                    onClick={handleSaveAsTemplate}
                    disabled={!templateNameDraft.trim() || templateSaving}
                    style={{ ...s.templateSaveConfirmBtn, opacity: !templateNameDraft.trim() || templateSaving ? 0.6 : 1 }}
                  >
                    {templateSaving ? "…" : "Save"}
                  </button>
                  <button style={s.templateCancelBtn} onClick={() => { setSavingAsTemplate(false); setTemplateNameDraft(""); }}>
                    Cancel
                  </button>
                </div>
              )}

              {templateSavedFlash && <div style={s.templateSavedFlash}>✓ Saved as template</div>}
            </div>
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
  header: { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--ink)", border: "none", padding: "10px 14px", cursor: "pointer", color: "var(--text)", gap: 10 },
  headerLeft: { display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  icon: { fontSize: 14, flexShrink: 0 },
  label: { fontSize: 13, fontWeight: 600, color: "var(--mute)", flexShrink: 0 },
  preview: { fontSize: 12, color: "var(--mute)", opacity: 0.75, fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, minWidth: 0 },
  badge: { fontSize: 10, background: "var(--accent-dim)", color: "var(--accent)", borderRadius: 4, padding: "2px 6px", fontWeight: 700, flexShrink: 0 },
  chevron: { fontSize: 22, color: "var(--mute)", transition: "transform 0.2s" },
  body: { background: "var(--panel)", padding: "10px 14px 14px", display: "flex", flexDirection: "column" as const, gap: 8 },
  templateRow: { position: "relative" as const },
  templateBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" },
  templateEmptyLink: { fontSize: 11, fontWeight: 600, color: "var(--accent)", textDecoration: "none", alignSelf: "flex-start" as const },
  templateDropdown: { position: "absolute" as const, top: "calc(100% + 4px)", left: 0, zIndex: 20, background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 8, padding: 4, minWidth: 200, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column" as const },
  templateItem: { background: "transparent", border: "none", color: "var(--text)", padding: "8px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left" as const, borderRadius: 6 },
  saveTemplateRow: { display: "flex", gap: 6, marginTop: 6, alignItems: "center" as const },
  saveTemplateInput: { flex: 1, minWidth: 0, background: "var(--panel2)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6, padding: "6px 8px", fontSize: 12 },
  templateSaveConfirmBtn: { background: "var(--accent)", border: "none", color: "#fff", borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" },
  templateCancelBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 6, padding: "6px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" },
  templateSavedFlash: { fontSize: 11, fontWeight: 600, color: "#22C55E", marginTop: 6 },
  textarea: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "10px 12px", fontSize: 16, lineHeight: 1.6, resize: "vertical" as const, fontFamily: "monospace", minHeight: 120 },
  readOnlyText: { fontSize: 13, color: "var(--mute)", whiteSpace: "pre-wrap" as const, fontFamily: "inherit", lineHeight: 1.6, margin: 0 },
  videoInput: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 12px", fontSize: 13 },
  videoLink: { fontSize: 13, fontWeight: 600, color: "var(--accent)", textDecoration: "none", alignSelf: "flex-start" as const },
};

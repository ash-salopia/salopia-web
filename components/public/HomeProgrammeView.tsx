"use client";

// Public, no-login "Home Programme" viewer (0058) — /g/[code]. Read
// only: no set-completion tracking, no identity, since there's no
// individual athlete profile behind this link (younger squads doing
// home workouts, per the product ask). A template's defs already give
// the "pick one of several sessions" range this needed, so the only
// new behaviour here is the equipment filter swapping each exercise
// for its coach-authored alternative.

import { useMemo, useState } from "react";
import VideoModal from "@/components/VideoModal";
import type { Template, TemplateDef, ExerciseBase } from "@/types";
import type { ResolvedBranding } from "@/types/branding";

// What's actually shown for one exercise, after equipment filtering.
// The primary prescription and every alternative are all just
// "variants", each optionally tagged with the equipment it needs
// (blank = none/bodyweight) - deliberately NOT special-casing "primary
// has no tag" as "always win", since that previously meant an
// untagged primary could never be swapped for a tagged alternative at
// all. Whichever variant's tag matches what the viewer picked wins;
// with nothing picked, or no match, the primary shows.
function resolveDisplay(ex: ExerciseBase, activeEquipment: Set<string>) {
  const primary = { name: ex.name, sets: ex.sets, reps: ex.reps, rest: ex.rest, notes: ex.notes, video_url: ex.video_url, order: ex.order, equipment: ex.equipment ?? "" };
  if (activeEquipment.size === 0) return { ...primary, swapped: false, noMatch: false };

  if (primary.equipment && activeEquipment.has(primary.equipment)) {
    return { ...primary, swapped: false, noMatch: false };
  }
  const alt = (ex.alternatives ?? []).find((a) => a.equipment && activeEquipment.has(a.equipment));
  if (alt) {
    return {
      name: alt.name,
      sets: alt.sets ?? ex.sets,
      reps: alt.reps || ex.reps,
      rest: alt.rest || ex.rest,
      notes: alt.notes || ex.notes,
      video_url: alt.video_url || "",
      order: ex.order,
      equipment: alt.equipment,
      swapped: true,
      noMatch: false,
    };
  }
  // Nothing matched the viewer's equipment - if the primary itself
  // needs none (bodyweight), it still works regardless, so don't warn.
  return { ...primary, swapped: false, noMatch: !!primary.equipment };
}

function equipmentOptions(def: TemplateDef): string[] {
  const tags = new Set<string>();
  for (const ex of def.exercises ?? []) {
    if (ex.equipment) tags.add(ex.equipment);
    for (const alt of ex.alternatives ?? []) {
      if (alt.equipment) tags.add(alt.equipment);
    }
  }
  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}

export default function HomeProgrammeView({ template, branding }: { template: Template; branding: ResolvedBranding }) {
  const defs = template.defs ?? [];
  const [activeDefId, setActiveDefId] = useState<string | null>(defs.length === 1 ? defs[0].id : null);
  const [activeEquipment, setActiveEquipment] = useState<Set<string>>(new Set());
  const [videoUrl, setVideoUrl] = useState<{ url: string; title: string } | null>(null);

  const activeDef = defs.find((d) => d.id === activeDefId) ?? null;
  const equipTags = useMemo(() => (activeDef ? equipmentOptions(activeDef) : []), [activeDef]);

  const toggleEquipment = (tag: string) => {
    setActiveEquipment((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt={branding.displayName} style={s.logo} />
        ) : (
          <div style={{ ...s.brand, color: branding.primaryColor }}>{branding.displayName}</div>
        )}
        {branding.showOrgName && <div style={s.orgLine}>{template.name}</div>}
      </div>

      {!activeDef ? (
        <div style={s.body}>
          <div style={s.title}>{template.name}</div>
          <div style={s.subtitle}>Choose today's session</div>
          <div style={s.sessionList}>
            {defs.map((d) => (
              <button key={d.id} style={{ ...s.sessionCard, borderColor: branding.primaryColor }} onClick={() => setActiveDefId(d.id)}>
                <span style={s.sessionName}>{d.name}</span>
                <span style={s.sessionMeta}>{(d.exercises ?? []).length} exercise{(d.exercises ?? []).length === 1 ? "" : "s"}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={s.body}>
          {defs.length > 1 && (
            <button style={s.backBtn} onClick={() => setActiveDefId(null)}>
              ← All sessions
            </button>
          )}
          <div style={s.title}>{activeDef.name}</div>
          {activeDef.notes && <div style={s.sessionNotes}>{activeDef.notes}</div>}

          {equipTags.length > 0 && (
            <div style={s.equipRow}>
              <div style={s.equipLabel}>What have you got today?</div>
              <div style={s.chipRow}>
                {equipTags.map((tag) => {
                  const on = activeEquipment.has(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleEquipment(tag)}
                      style={{
                        ...s.chip,
                        borderColor: on ? branding.primaryColor : "var(--line)",
                        background: on ? branding.primaryColorDim : "transparent",
                        color: on ? branding.primaryColor : "var(--text)",
                      }}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={s.exList}>
            {(activeDef.exercises ?? []).map((ex, i) => {
              const d = resolveDisplay(ex, activeEquipment);
              return (
                <div key={i} style={s.exCard}>
                  <div style={s.exHeaderRow}>
                    <div style={s.exName}>
                      {d.order && <span style={s.exOrder}>{d.order}</span>}
                      {d.name}
                    </div>
                    {d.video_url && (
                      <button style={{ ...s.videoBtn, color: branding.primaryColor }} onClick={() => setVideoUrl({ url: d.video_url!, title: d.name })}>
                        ▶ Watch
                      </button>
                    )}
                  </div>
                  {d.swapped && <div style={s.swapTag}>Swapped for available equipment</div>}
                  {d.noMatch && <div style={s.swapTagWarn}>No match for your equipment — showing original</div>}
                  <div style={s.exMetaRow}>
                    <span><strong>{d.sets}</strong> sets</span>
                    {d.reps && <span><strong>{d.reps}</strong> reps</span>}
                    {d.rest && <span>Rest <strong>{d.rest}</strong></span>}
                  </div>
                  {d.notes && <div style={s.exNotes}>{d.notes}</div>}
                </div>
              );
            })}
            {(activeDef.exercises ?? []).length === 0 && <div style={s.subtitle}>No exercises in this session yet.</div>}
          </div>
        </div>
      )}

      {videoUrl && <VideoModal videoUrl={videoUrl.url} title={videoUrl.title} onClose={() => setVideoUrl(null)} />}

      {branding.showPoweredBy && <div style={s.poweredBy}>Powered by VIS BUILD</div>}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "var(--ink)", color: "var(--text)", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" },
  header: { padding: "20px 20px 12px", borderBottom: "1px solid var(--line)" },
  logo: { height: 32, objectFit: "contain" as const },
  brand: { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22, letterSpacing: 2 },
  orgLine: { fontSize: 12, color: "var(--mute)", marginTop: 2 },
  body: { padding: 20, maxWidth: 640, margin: "0 auto" },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 14, color: "var(--mute)", marginBottom: 16 },
  sessionList: { display: "flex", flexDirection: "column", gap: 10, marginTop: 16 },
  sessionCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "var(--panel)",
    border: "1px solid",
    borderRadius: 12,
    padding: "16px 18px",
    cursor: "pointer",
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text)",
    textAlign: "left" as const,
  },
  sessionName: {},
  sessionMeta: { fontSize: 12, fontWeight: 500, color: "var(--mute)" },
  backBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 12 },
  sessionNotes: { fontSize: 13, color: "var(--mute)", marginBottom: 16, lineHeight: 1.5 },
  equipRow: { marginBottom: 20 },
  equipLabel: { fontSize: 12, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 8 },
  chipRow: { display: "flex", gap: 8, flexWrap: "wrap" as const },
  chip: { border: "1px solid", borderRadius: 20, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  exList: { display: "flex", flexDirection: "column", gap: 12 },
  exCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16 },
  exHeaderRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  exName: { fontSize: 16, fontWeight: 700 },
  exOrder: { color: "var(--mute)", fontWeight: 600, fontSize: 13, marginRight: 8 },
  videoBtn: { background: "transparent", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 },
  swapTag: { fontSize: 11, fontWeight: 600, color: "var(--good)", marginTop: 4 },
  swapTagWarn: { fontSize: 11, fontWeight: 600, color: "var(--warn)", marginTop: 4 },
  exMetaRow: { display: "flex", gap: 16, fontSize: 13, color: "var(--mute)", marginTop: 8 },
  exNotes: { fontSize: 13, color: "var(--text)", marginTop: 10, lineHeight: 1.5, background: "var(--ink)", borderRadius: 8, padding: "8px 10px" },
  poweredBy: { textAlign: "center" as const, fontSize: 11, color: "var(--mute)", padding: "24px 0" },
};

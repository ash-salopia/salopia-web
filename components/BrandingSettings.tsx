"use client";

// ============================================================
// BrandingSettings
// Embedded in the Settings page.
// Standard tier: accent colour picker only.
// Premium tier: full white-label — name, logo, colours.
// ============================================================

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { OrgBranding, OrgTier } from "@/types/branding";

interface Props {
  orgId: string;
  orgName: string;
  tier: OrgTier;
  branding: OrgBranding;
  onSaved: (branding: OrgBranding) => void;
}

const PRESET_COLOURS = [
  { label: "AthletiQ Teal", color: "#00d4ff", dim: "#002233" },
  { label: "Electric Blue",  color: "#3B8BEB", dim: "#0a1a2e" },
  { label: "Purple",         color: "#A855F7", dim: "#1a0a2a" },
  { label: "Green",          color: "#10B981", dim: "#0a2218" },
  { label: "Amber",          color: "#F59E0B", dim: "#2a1e00" },
  { label: "Red",            color: "#EF4444", dim: "#2a0a0a" },
  { label: "Pink",           color: "#EC4899", dim: "#2a0a1a" },
  { label: "White",          color: "#ffffff", dim: "#1a1a1a" },
];

export default function BrandingSettings({ orgId, orgName, tier, branding: initialBranding, onSaved }: Props) {
  const [branding, setBranding] = useState<OrgBranding>(initialBranding);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isPremium = tier === "premium";

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("organisations")
        .update({ branding })
        .eq("id", orgId);
      if (error) throw error;
      onSaved(branding);
      // Apply colour changes immediately without requiring a page refresh
      if (branding.primary_color) {
        document.documentElement.style.setProperty("--accent", branding.primary_color);
      }
      if (branding.primary_color_dim) {
        document.documentElement.style.setProperty("--accent-dim", branding.primary_color_dim);
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(file: File) {
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop();
      const path = `${orgId}/logo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("org-logos")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("org-logos").getPublicUrl(path);
      setBranding(b => ({ ...b, logo_url: data.publicUrl }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div>
          <div style={s.title}>🎨 Branding</div>
          <div style={s.subtitle}>
            {isPremium
              ? "Premium — full white-label branding"
              : "Standard — AthletiQ branding with your accent colour"}
          </div>
        </div>
        <div style={{ ...s.tierBadge, background: isPremium ? "#A855F722" : "var(--ink)", color: isPremium ? "#A855F7" : "var(--mute)", border: `1px solid ${isPremium ? "#A855F744" : "var(--line)"}` }}>
          {isPremium ? "⭐ Premium" : "Standard"}
        </div>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {/* Accent colour — both tiers */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Accent colour</div>
        <div style={s.sectionDesc}>Used for buttons, highlights, and active states throughout the app.</div>
        <div style={s.colourGrid}>
          {PRESET_COLOURS.map(p => (
            <button
              key={p.color}
              style={{ ...s.colourSwatch, background: p.color, boxShadow: branding.primary_color === p.color ? `0 0 0 3px ${p.color}55, 0 0 0 5px var(--ink)` : "none" }}
              title={p.label}
              onClick={() => { setBranding(b => ({ ...b, primary_color: p.color, primary_color_dim: p.dim })); document.documentElement.style.setProperty("--accent", p.color); document.documentElement.style.setProperty("--accent-dim", p.dim); }}
            />
          ))}
          {/* Custom colour picker */}
          <div style={s.customColourWrap}>
            <input
              type="color"
              value={branding.primary_color ?? "#00d4ff"}
              onChange={e => { setBranding(b => ({ ...b, primary_color: e.target.value })); document.documentElement.style.setProperty("--accent", e.target.value); }}
              style={s.colourPicker}
              title="Custom colour"
            />
            <span style={{ fontSize: 10, color: "var(--mute)" }}>Custom</span>
          </div>
        </div>
        {/* Preview */}
        <div style={{ ...s.preview, borderColor: branding.primary_color ?? "#00d4ff" }}>
          <span style={{ color: branding.primary_color ?? "#00d4ff", fontWeight: 700, fontSize: 18, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2 }}>
            AthletiQ
          </span>
          <button style={{ background: branding.primary_color ?? "#00d4ff", color: "#0a1420", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "default" }}>
            Button
          </button>
        </div>
      </div>

      {/* Premium-only section */}
      {isPremium ? (
        <>
          <div style={s.section}>
            <div style={s.sectionLabel}>Brand name</div>
            <div style={s.sectionDesc}>Replaces "AthletiQ" in the header and athlete app. Leave blank to use "AthletiQ".</div>
            <input
              value={branding.brand_name ?? ""}
              onChange={e => setBranding(b => ({ ...b, brand_name: e.target.value }))}
              placeholder="Your brand name"
              style={s.input}
            />
          </div>

          <div style={s.section}>
            <div style={s.sectionLabel}>Logo</div>
            <div style={s.sectionDesc}>Displayed in the header instead of the brand name. PNG or SVG, max 2MB.</div>
            {branding.logo_url && (
              <div style={s.logoPreview}>
                <img src={branding.logo_url} alt="Logo" style={{ height: 40, objectFit: "contain" }} />
                <button style={s.removeLogoBtn} onClick={() => setBranding(b => ({ ...b, logo_url: undefined }))}>
                  Remove
                </button>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={e => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
            <button style={s.uploadBtn} onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? "Uploading…" : "Upload logo"}
            </button>
          </div>

          <div style={s.section}>
            <div style={s.sectionLabel}>Footer credit</div>
            <label style={s.checkLabel}>
              <input
                type="checkbox"
                checked={branding.show_powered_by ?? false}
                onChange={e => setBranding(b => ({ ...b, show_powered_by: e.target.checked }))}
                style={{ accentColor: "var(--accent)" }}
              />
              Show "Powered by AthletiQ" in the footer
            </label>
          </div>
        </>
      ) : (
        <div style={s.upgradeBox}>
          <div style={s.upgradeTitle}>🚀 Upgrade to Premium for full white-labelling</div>
          <div style={s.upgradeList}>
            <div>✓ Custom brand name — replace "AthletiQ" with your brand</div>
            <div>✓ Logo upload — your logo in the header and athlete app</div>
            <div>✓ Athletes see your brand, not AthletiQ</div>
            <div>✓ Optional "Powered by AthletiQ" footer</div>
          </div>
          <div style={{ fontSize: 12, color: "var(--mute)", marginTop: 8 }}>
            Contact us to upgrade your organisation.
          </div>
        </div>
      )}

      <button
        style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }}
        disabled={saving}
        onClick={handleSave}
      >
        {saving ? "Saving…" : success ? "✓ Saved" : "Save branding"}
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { marginTop: 32, borderTop: "1px solid var(--line)", paddingTop: 24 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title: { fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 4 },
  subtitle: { fontSize: 12, color: "var(--mute)" },
  tierBadge: { borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 700, flexShrink: 0 },
  error: { background: "#2a0c0c", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12 },
  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 4 },
  sectionDesc: { fontSize: 12, color: "var(--mute)", marginBottom: 10 },
  colourGrid: { display: "flex", gap: 8, flexWrap: "wrap" as const, alignItems: "center", marginBottom: 12 },
  colourSwatch: { width: 28, height: 28, borderRadius: 6, border: "none", cursor: "pointer", transition: "box-shadow 0.15s", flexShrink: 0 },
  customColourWrap: { display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 2 },
  colourPicker: { width: 28, height: 28, padding: 0, border: "none", borderRadius: 6, cursor: "pointer", background: "none" },
  preview: { background: "var(--panel)", border: "1px solid", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  input: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14 },
  logoPreview: { display: "flex", alignItems: "center", gap: 12, marginBottom: 10, background: "var(--ink)", borderRadius: 8, padding: "10px 14px" },
  removeLogoBtn: { background: "transparent", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" },
  uploadBtn: { background: "var(--ink)", border: "1px dashed var(--line)", color: "var(--mute)", borderRadius: 8, padding: "9px 16px", fontSize: 13, cursor: "pointer" },
  checkLabel: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)", cursor: "pointer" },
  upgradeBox: { background: "var(--panel)", border: "1px solid #A855F744", borderRadius: 12, padding: 16, marginBottom: 16 },
  upgradeTitle: { fontSize: 14, fontWeight: 700, color: "#A855F7", marginBottom: 10 },
  upgradeList: { display: "flex", flexDirection: "column" as const, gap: 6, fontSize: 13, color: "var(--mute)" },
  saveBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "11px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
};

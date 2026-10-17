// Branding helpers for the HTML (print-window) reports — the training
// load report (ReportModal), the leaderboards print (LeaderboardsView)
// and anything else that builds a report as an HTML string and opens it
// in a new tab to print.
//
// Two twins render the same marks for the other output paths:
//   - components/reports/pdf/pdf-brand-header.tsx  (react-pdf header)
//   - components/reports/pdf/pdf-credit-footer.tsx (react-pdf footer)
//   - components/reports/TestReportBody.tsx renders its own header inline
//
// Rule: the org's own branding (premium logo / name / accent colour, or
// the standard-tier accent colour on the "VIS BUILD" wordmark) sits at
// the TOP of every report; the "Produced using visbuild.co.uk" credit
// always sits at the FOOT, regardless of tier.

import type { ResolvedBranding } from "@/types/branding";

export const REPORT_CREDIT_TEXT = "Produced using visbuild.co.uk";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// Brand mark for the top of an HTML report: the org's uploaded logo
// (premium), else the brand name in the accent colour. Mirrors
// <BrandHeader> and TestReportBody's header row.
export function brandHeaderHtml(branding: ResolvedBranding): string {
  const color = branding.primaryColor || "#1f6fd6";
  if (branding.logoUrl) {
    return `<img src="${esc(branding.logoUrl)}" alt="${esc(branding.displayName)}" style="height:34px;max-width:230px;object-fit:contain;display:block" />`;
  }
  return `<div style="font-family:'Barlow Condensed',-apple-system,sans-serif;font-weight:700;font-size:22px;color:${esc(
    color,
  )};letter-spacing:2px;line-height:1">${esc(branding.displayName)}</div>`;
}

// "Produced using visbuild.co.uk" credit for the foot of an HTML report.
// Always shown — an org's own branding is already at the top.
export function reportCreditFooterHtml(): string {
  return `<div style="margin-top:28px;padding-top:9px;border-top:1px solid #d8dde3;display:flex;align-items:center;gap:6px;font-size:9.5px;color:#6b7684">
    <span style="font-family:'Barlow Condensed',-apple-system,sans-serif;font-weight:700;letter-spacing:1.5px;color:#1f6fd6">VIS BUILD</span>
    <span>${REPORT_CREDIT_TEXT}</span>
  </div>`;
}

// ── Colour report theme ──────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("");
}

function mix(hex: string, target: [number, number, number], amount: number): string {
  const rgb = hexToRgb(hex) ?? [31, 111, 214];
  return toHex(rgb.map((c, i) => c + (target[i] - c) * amount) as [number, number, number]);
}

function luminance(hex: string): number {
  const rgb = hexToRgb(hex) ?? [31, 111, 214];
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Colours for the coloured (share / PDF) report, derived from the org's
 * brand colour. A light brand colour (e.g. the default cyan) is darkened
 * for text so headings stay readable on white.
 */
export function reportThemeColours(branding: ResolvedBranding) {
  const brand = hexToRgb(branding.primaryColor || "") ? branding.primaryColor : "#1f6fd6";
  const text = luminance(brand) > 0.35 ? mix(brand, [0, 0, 0], 0.45) : brand;
  return {
    brand,
    text, // headings / accents on white
    tint: mix(brand, [255, 255, 255], 0.9), // soft background wash
    band: `linear-gradient(135deg, #0d1724 0%, ${mix(brand, [13, 23, 36], 0.55)} 62%, ${mix(brand, [13, 23, 36], 0.15)} 100%)`,
  };
}

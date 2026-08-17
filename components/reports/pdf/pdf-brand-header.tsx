// Shared report header mark - the org's uploaded logo (premium tier,
// via BrandingSettings.tsx) if one exists, else the same text brand
// every report already showed. Used by every Page across both PDF
// reports (AthleteReportPdf, SquadReportPdf) so a coach's branding is
// consistent everywhere a report gets printed, not just the app UI.
//
// SVG logos are skipped in favour of the text fallback: react-pdf's
// Image component rasterises PNG/JPEG/WEBP/GIF fine but doesn't
// reliably support arbitrary external SVG sources, and the logo
// upload (app/api/org-logo/route.ts) accepts SVG among its allowed
// types for the on-screen header, which the PDF can't just assume.
"use client";

import { Image, Text, StyleSheet } from "@react-pdf/renderer";
import type { ResolvedBranding } from "@/types/branding";

const style = StyleSheet.create({
  text: { fontFamily: "Helvetica-Bold", fontSize: 18, letterSpacing: 1 },
});

export default function BrandHeader({ branding }: { branding: ResolvedBranding }) {
  const isSvg = branding.logoUrl?.toLowerCase().split("?")[0].endsWith(".svg");
  if (branding.logoUrl && !isSvg) {
    return <Image src={branding.logoUrl} style={{ height: 34, maxWidth: 200, objectFit: "contain" }} />;
  }
  return <Text style={[style.text, { color: branding.primaryColor }]}>{branding.displayName}</Text>;
}

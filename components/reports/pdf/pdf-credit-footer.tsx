// "Produced using visbuild.co.uk" — the fixed credit at the foot of
// every page of every PDF report (AthleteReportPdf, SquadReportPdf,
// TestReportPdf). Shown regardless of an org's own premium branding at
// the top of the page. HTML twin: lib/report-branding.ts
// (reportCreditFooterHtml).
"use client";

import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { REPORT_CREDIT_TEXT } from "@/lib/report-branding";

const s = StyleSheet.create({
  footer: {
    position: "absolute",
    bottom: 16,
    left: 32,
    right: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderTopWidth: 0.5,
    borderTopColor: "#d8dde3",
    paddingTop: 5,
  },
  mark: { fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1, color: "#1f6fd6" },
  text: { fontFamily: "Helvetica", fontSize: 6.5, color: "#6b7684" },
});

export default function CreditFooter() {
  return (
    <View style={s.footer} fixed>
      <Text style={s.mark}>VIS BUILD</Text>
      <Text style={s.text}>{REPORT_CREDIT_TEXT}</Text>
    </View>
  );
}

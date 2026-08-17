import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VIS BUILD",
  description: "Coach-managed programme builder",
  manifest: "/manifest.json",
  // iOS Safari only supports Web Push for a site added to the home
  // screen (installed as a PWA) — apple-mobile-web-app-capable is what
  // makes that installable/standalone rather than opening back in
  // Safari's chrome every time.
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "VIS BUILD" },
};

// No viewport meta previously — mobile browsers fell back to a virtual
// desktop-width viewport, which is part of why the coach app rendered
// oddly on phones.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

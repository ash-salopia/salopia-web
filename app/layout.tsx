import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AthletiQ Health & Performance",
  description: "Coach-managed programme builder",
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

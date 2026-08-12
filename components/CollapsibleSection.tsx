"use client";

import { useState, type ReactNode } from "react";

// Generic accordion wrapper used across the Settings page - every
// section header collapses to reduce clutter, hidden until clicked.
// headerRight (badges, action buttons) stays clickable independent of
// the toggle via stopPropagation, since a native <button> can't
// nest inside another <button> (the header itself uses role="button"
// on a div for exactly this reason).
export default function CollapsibleSection({
  title,
  subtitle,
  headerRight,
  defaultOpen = false,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  headerRight?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={s.wrap}>
      <div
        style={s.header}
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        <div style={s.headerLeft}>
          <span style={{ ...s.chevron, transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>›</span>
          <div style={{ minWidth: 0 }}>
            <div style={s.title}>{title}</div>
            {subtitle && <div style={s.subtitle}>{subtitle}</div>}
          </div>
        </div>
        {headerRight && (
          <div onClick={(e) => e.stopPropagation()} style={s.headerRight}>
            {headerRight}
          </div>
        )}
      </div>
      {open && <div style={s.body}>{children}</div>}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 12, marginBottom: 12, overflow: "hidden" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 18px", cursor: "pointer", userSelect: "none" as const },
  headerLeft: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 },
  headerRight: { flexShrink: 0, display: "flex", alignItems: "center" },
  chevron: { fontSize: 15, fontWeight: 700, color: "var(--mute)", transition: "transform 0.15s", flexShrink: 0, display: "inline-block" },
  title: { fontSize: 15, fontWeight: 700, color: "var(--text)" },
  subtitle: { fontSize: 12, color: "var(--mute)", marginTop: 2 },
  body: { padding: "0 18px 18px", display: "flex", flexDirection: "column" as const, gap: 14 },
};

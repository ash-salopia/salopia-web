// Small line icons (stroke = currentColor) used in place of emoji in the
// athlete app, so buttons and labels read as a professional product
// rather than a chat app. Size defaults to 16px; colour follows text.

export type IconName =
  | "menu"
  | "settings"
  | "history"
  | "swap"
  | "note"
  | "lock"
  | "trophy"
  | "target"
  | "wrench"
  | "close"
  | "chevron-down"
  | "file"
  | "video"
  | "link";

const PATHS: Record<IconName, string> = {
  menu: "M4 6h16M4 12h16M4 18h16",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  history: "M3 3v18h18 M7 15l4-4 3 3 5-6",
  swap: "M7 4 3 8l4 4 M3 8h14 M17 20l4-4-4-4 M21 16H7",
  note: "M4 20h4L19 9l-4-4L4 16v4z M13.5 6.5l4 4",
  lock: "M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4",
  trophy: "M8 21h8 M12 17v4 M7 4h10v5a5 5 0 0 1-10 0V4z M17 6h3v2a3 3 0 0 1-3 3 M7 6H4v2a3 3 0 0 0 3 3",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 12h.01",
  wrench: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6z",
  close: "M6 6l12 12M18 6 6 18",
  "chevron-down": "M6 9l6 6 6-6",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5",
  video: "M4 6h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z M16 10l5-3v10l-5-3",
  link: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1 M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
};

export default function Icon({ name, size = 16, strokeWidth = 1.8, style }: { name: IconName; size?: number; strokeWidth?: number; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
